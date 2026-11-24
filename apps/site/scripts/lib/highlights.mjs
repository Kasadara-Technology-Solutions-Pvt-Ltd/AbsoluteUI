// Key features per component for the Introduction grid (R20-12), one JSON file per
// component in scripts/highlights/<name>.json: three to six items, each
// { "title": two to four words, "text": one sentence }. Text only.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { siteDir } from './shared.mjs';

const dir = join(siteDir, 'scripts', 'highlights');

function load() {
  /** @type {Record<string, { title: string, text: string }[]>} */
  const out = {};
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const items = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const ok = Array.isArray(items) && items.length >= 3 && items.length <= 6 && items.every((i) => typeof i?.title === 'string' && typeof i?.text === 'string' && i.title.trim() && i.text.trim());
    if (!ok) throw new Error(`highlights: ${file} must hold 3 to 6 { title, text } items`);
    out[file.slice(0, -5)] = items;
  }
  return out;
}

export const HIGHLIGHTS = load();
