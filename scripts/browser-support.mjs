// Browser support matrix (SPEC section 3.2, R15-1): which features catalogued in
// docs/browser-support.json the published packages use, with their web-features support data.
// Shared by scripts/check-browser-support.mjs and the docs site generator.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { features as webFeatures } from 'web-features';
import { root, readJson, walk, rel } from './lib.mjs';

const PUBLISHED = ['helpers', 'core', 'utilities', 'theme', 'icons', 'components', 'angular'];
const TEST = /[\\/](test|tests|__tests__)[\\/]|\.(test|spec)\.ts$/;

/** Comments are not code: drop block and line comments before matching (keeps `://` in strings). */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

/** "18.3" -> [18, 3]; web-features may prefix ranges ("≤79"), which count as the stated version. */
export const version = (v) => String(v).replace(/[^\d.]/g, '');
export function compareVersions(a, b) {
  const [x, y] = [version(a).split('.').map(Number), version(b).split('.').map(Number)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

export function browserSupport() {
  const config = readJson(join(root, 'docs', 'browser-support.json'));
  const sources = PUBLISHED.flatMap((p) => walk(join(root, 'packages', p, 'src'), (f) => /\.(ts|scss|css)$/.test(f) && !TEST.test(f)))
    .map((file) => ({ file, text: code(readFileSync(file, 'utf8')) }));
  const unknown = [];
  const used = [];
  for (const f of config.features) {
    const data = webFeatures[f.id];
    if (!data) { unknown.push(f.id); continue; }
    const re = new RegExp(f.detect);
    const files = sources.filter((s) => re.test(s.text)).map((s) => rel(s.file));
    if (files.length) used.push({ ...f, support: data.status?.support ?? {}, files });
  }
  return { config, used, unknown };
}
