// docs/PLAN-R9-ANGULAR.md M8b item 7 (D3): server rendering sweep of every generated Angular
// component. Each component's first example (packages/components/metadata/<name>/examples.json)
// runs in Node against Angular's server DOM (the domino build bundled with
// @angular/platform-server), completed exactly as the Angular bridge does on the server
// (completeServerDom, D20), with the same globals Angular's server platform sets (DOM classes, no
// window, no global document). The result per component is "server" (created and rendered) or
// "browser" with the reason; it is written to packages/angular/metadata/server-rendering.json,
// which the metadata generator reads. --check fails on drift. Run after npm run build.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import { CONTROLS, HOSTS } from './adapter-components.mjs';
import { fail, readJson, root } from './lib.mjs';

const check = process.argv.includes('--check');
const outFile = join(root, 'packages', 'angular', 'metadata', 'server-rendering.json');
const work = join(root, '.cache', 'angular-ssr-sweep');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const dominoModule = await import(pathToFileURL(join(root, 'node_modules', '@angular', 'platform-server', 'third_party', 'domino', 'bundled-domino.mjs')).href);
const domino = dominoModule.default ?? dominoModule;
// What @angular/platform-server sets up (setDomTypes): DOM classes as globals, no window/document.
Object.assign(globalThis, domino.impl);
globalThis.KeyboardEvent = domino.impl.Event;
// The sweep is about rendering, not the network: requests in examples never settle.
globalThis.fetch = () => new Promise(() => undefined);
const { completeServerDom } = await import(pathToFileURL(join(root, 'packages', 'angular', 'dist', 'internal', 'server-dom.js')).href);

const names = [...Object.keys(CONTROLS), ...HOSTS].sort();
const results = {};
for (const name of names) {
  const examples = readJson(join(root, 'packages', 'components', 'metadata', name, 'examples.json')).examples;
  const example = examples.find((e) => e.language === 'ts');
  if (!example) {
    results[name] = { mode: 'browser', reason: 'no runnable example' };
    continue;
  }
  const doc = domino.createDocument('<!doctype html><html><head></head><body></body></html>', true);
  completeServerDom(doc);
  // Examples that enhance existing markup find it by id: provide those elements (forms where typed so).
  for (const m of example.code.matchAll(/querySelector(?:<(\w+)>)?\('#([\w-]+)'\)/g)) {
    const el = doc.createElement(m[1] === 'HTMLFormElement' ? 'form' : 'div');
    el.id = m[2];
    doc.body.appendChild(el);
  }
  const provided = doc.body.querySelectorAll('*').length;
  globalThis.__auiSsrDocument = doc;
  // The example's own `document` is the server document; components must not use globals.
  const { code } = await transform(example.code, { loader: 'ts', format: 'esm', target: 'es2022', define: { document: '__auiSsrDocument' } });
  const file = join(work, `${name}.mjs`);
  writeFileSync(file, code);
  try {
    await import(pathToFileURL(file).href);
    // Let microtasks and zero-delay timers of the example run.
    await delay(0);
    const rendered = doc.body.querySelectorAll('*').length;
    // Created without errors: it renders on the server (some render nothing yet by design, for example a delayed spinner).
    results[name] = rendered > provided ? { mode: 'server' } : { mode: 'server', note: 'renders nothing on the server by design (for example until a delay elapses)' };
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message.split('\n')[0]}` : String(error);
    results[name] = { mode: 'browser', reason };
  }
}
delete globalThis.__auiSsrDocument;

const content = `${JSON.stringify({ schemaVersion: 1, generatedBy: 'scripts/angular-ssr-sweep.mjs', components: results }, null, 2)}\n`;
const server = Object.values(results).filter((r) => r.mode === 'server').length;
if (check) {
  if (!existsSync(outFile) || readFileSync(outFile, 'utf8') !== content) fail(['packages/angular/metadata/server-rendering.json is out of date; run node scripts/angular-ssr-sweep.mjs']);
  console.log(`check:angular-ssr-sweep: ok (${String(server)} of ${String(names.length)} render on the server)`);
} else {
  writeFileSync(outFile, content);
  console.log(`angular-ssr-sweep: ${String(server)} of ${String(names.length)} render on the server`);
  for (const [name, r] of Object.entries(results)) if (r.mode === 'browser' || r.note) console.log(`  ${r.mode}: ${name}: ${r.reason ?? r.note}`);
}
process.exit(0);
