// Live frames (docs/PLAN-R4.md R4-3, C9): isolated pages that load only AbsoluteUI CSS and
// the frame bundle, under the same strict CSP and Trusted Types policy as the e2e harness.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { appDir, cacheDir, clean, componentsDir, escapeHtml, publicDir, root, write } from './shared.mjs';

const outDir = join(publicDir, 'frames');
const framesSrc = join(appDir, 'frames');

export const FRAME_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types absoluteui',
].join('; ');

/**
 * Frames: `entry` under frames/, the components whose styles it needs, and its body markup.
 * Style chains (composed components) come from each component doc's "Styles:" header.
 */
export const FRAMES = [
  {
    id: 'hero-table',
    title: 'Data Table rendered by the code beside it',
    entry: 'hero-table.ts',
    components: ['data-table'],
    body: '<main class="solo"><div id="table"></div></main>',
  },
  {
    id: 'showcase',
    title: 'Theme showcase application',
    entry: 'showcase.ts',
    // Stat Card renders a Sparkline; its doc header omits that stylesheet.
    components: ['sidebar', 'sparkline', 'stat-card', 'line-chart', 'data-table', 'button'],
    body: `<div class="app">
<aside><div class="app__brand"><span></span>Acme Analytics</div><div id="nav"></div></aside>
<main>
<div class="app__head"><div><h1>Revenue overview</h1><p>October 2026 | all regions</p></div><div class="row" id="actions"></div></div>
<section class="stats" aria-label="Key metrics"><div id="stat-revenue"></div><div id="stat-accounts"></div><div id="stat-tickets"></div></section>
<section class="panel" id="chart"></section>
<section class="panel" id="table"></section>
</main>
</div>`,
  },
  {
    id: 'flag-grid',
    title: 'Data Grid live demo',
    entry: 'flagship.ts',
    components: ['data-grid'],
    body: '<main class="solo"><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="grid"',
  },
  {
    id: 'flag-sched',
    title: 'Scheduler live demo',
    entry: 'flagship.ts',
    components: ['scheduler'],
    body: '<main class="solo"><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="sched"',
  },
  {
    id: 'flag-gantt',
    title: 'Gantt live demo',
    entry: 'flagship.ts',
    components: ['gantt'],
    body: '<main class="solo"><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="gantt"',
  },
  {
    id: 'flag-pivot',
    title: 'Pivot Grid live demo',
    entry: 'flagship.ts',
    components: ['pivot-grid'],
    body: '<main class="solo"><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="pivot"',
  },
  {
    id: 'flag-charts',
    title: 'Charts live demo',
    entry: 'flagship.ts',
    components: ['line-chart','bar-chart'],
    body: '<main class="solo"><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="charts"',
  },
  {
    id: 'proof',
    title: 'Data Table live demo',
    entry: 'proof.ts',
    components: ['data-table'],
    body: '<main class="solo"><div id="grid"></div></main>',
  },
  {
    id: 'button',
    title: 'Button preview',
    entry: 'button.ts',
    components: ['button'],
    body: '<main class="solo"><div id="buttons" class="rows"></div></main>',
  },
  {
    id: 'skeleton',
    title: 'Skeleton preview',
    entry: 'previews.ts',
    components: ['skeleton'],
    body: '<main class="solo" data-preview-host><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="skeleton"',
  },
  {
    id: 'bottom-sheet',
    title: 'Bottom Sheet preview',
    entry: 'previews.ts',
    components: ['bottom-sheet'],
    body: '<main class="solo" data-preview-host><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="bottom-sheet"',
  },
  {
    id: 'context-menu',
    title: 'Context Menu preview',
    entry: 'previews.ts',
    components: ['context-menu'],
    body: '<main class="solo" data-preview-host><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="context-menu"',
  },
  {
    id: 'button-group',
    title: 'Button Group preview',
    entry: 'previews.ts',
    components: ['button', 'button-group'],
    body: '<main class="solo"><div id="preview"></div></main>',
    bodyAttributes: 'data-preview="button-group"',
  },
  {
    id: 'upload-queue',
    title: 'Upload Queue preview',
    entry: 'upload-queue.ts',
    components: ['upload-queue'],
    body: '<main class="solo"><div id="queue"></div></main>',
  },
];

/** Block frames (data/blocks.json): the block file is user-style code; a generated wrapper adds the runtime. */
export function blockFrames() {
  const { blocks } = JSON.parse(readFileSync(join(appDir, 'data', 'blocks.json'), 'utf8'));
  return blocks.map((b) => ({ id: `block-${b.id}`, title: b.title, entry: `blocks/${b.id}.ts`, wrap: true, components: b.components, body: b.body }));
}

const scriptName = (frame) => (frame.wrap ? frame.id : frame.entry.replace(/\.ts$/, ''));

/** Styles listed in a component doc header ("Styles: `a`, `b`, and `c`"). */
function headerStyles(name) {
  const doc = join(componentsDir, 'docs', `${name}.md`);
  if (!existsSync(doc)) return [name];
  // The header separates fields with " | " (escaped here: a bare | would be an alternation).
  const line = /^> .*Styles?: (.+?)(?: \| |$)/m.exec(readFileSync(doc, 'utf8'))?.[1] ?? '';
  const chain = [...line.matchAll(/`@absoluteui\/components\/([^/`]+)\/style\.css`/g)].map((m) => m[1]);
  return chain.length ? chain : [name];
}

function copyStyles() {
  const css = join(outDir, 'css');
  mkdirSync(css, { recursive: true });
  const dist = join(componentsDir, 'dist');
  for (const name of readdirSync(dist)) {
    const file = join(dist, name, 'style.css');
    if (existsSync(file)) copyFileSync(file, join(css, `${name}.css`));
  }
  copyFileSync(join(root, 'packages', 'theme', 'dist', 'absolute-default.css'), join(css, 'theme.css'));
  copyFileSync(join(framesSrc, 'frame.css'), join(css, 'frame.css'));
  // Noto Sans (the theme's default family), self-hosted: no third-party requests (R4-8).
  const fontPkg = join(root, 'node_modules', '@fontsource-variable', 'noto-sans');
  const fonts = join(outDir, 'fonts');
  mkdirSync(fonts, { recursive: true });
  const faces = readFileSync(join(fontPkg, 'index.css'), 'utf8').replace(/'Noto Sans Variable'/g, "'Noto Sans'");
  for (const m of faces.matchAll(/url\(\.\/files\/([^)]+)\)/g)) copyFileSync(join(fontPkg, 'files', m[1]), join(fonts, m[1]));
  write(join(css, 'fonts.css'), faces.replace(/url\(\.\/files\//g, 'url(../fonts/'));
}

function page(frame) {
  const styles = [];
  for (const c of frame.components) for (const s of headerStyles(c)) if (!styles.includes(s)) styles.push(s);
  const links = ['fonts', 'theme', ...styles, 'frame'].map((s) => `<link rel="stylesheet" href="css/${s}.css">`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<meta name="robots" content="noindex">
<title>${escapeHtml(frame.title)}</title>
${links}
<script type="module" src="js/${scriptName(frame)}.js"></script>
</head>
<body${frame.bodyAttributes ? ` ${frame.bodyAttributes}` : ''}>
${frame.body}
</body>
</html>
`;
}

export async function buildFrames() {
  clean(outDir);
  const entryDir = join(cacheDir, 'frames');
  clean(entryDir);
  copyStyles();
  const frames = [...FRAMES, ...blockFrames()];
  const entries = {};
  for (const frame of frames) {
    if (frame.wrap) {
      const wrapper = join(entryDir, `${frame.id}.ts`);
      const slash = (f) => f.split('\\').join('/');
      write(wrapper, `import '${slash(join(framesSrc, 'runtime.ts'))}';\nimport '${slash(join(framesSrc, frame.entry))}';\n`);
      entries[frame.id] = wrapper;
    } else entries[scriptName(frame)] = join(framesSrc, frame.entry);
  }
  for (const frame of frames) {
    for (const c of frame.components) if (!existsSync(join(outDir, 'css', `${c}.css`))) throw new Error(`frames: no stylesheet for ${c} (run npm run build first)`);
    write(join(outDir, `${frame.id}.html`), page(frame));
  }
  await build({
    entryPoints: entries,
    outdir: join(outDir, 'js'),
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'eof',
    chunkNames: 'chunks/[name]-[hash]',
    // Resolve packages by their published exports (dist), not the root tsconfig paths (src):
    // one copy of @absoluteui/core per frame.
    tsconfig: join(framesSrc, 'tsconfig.json'),
    logLevel: 'warning',
  });
  return frames.length;
}
