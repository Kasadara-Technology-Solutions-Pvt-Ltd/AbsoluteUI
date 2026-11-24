// Shared helpers for the documentation generator (R4 phase A).
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const root = resolve(siteDir, '..', '..');
export const componentsDir = join(root, 'packages', 'components');
export const metaDir = join(componentsDir, 'metadata');
export const docsSrcDir = join(componentsDir, 'docs');
// The docs build with Astro `base: '/docs'` (docs/PLAN-ONE-SITE.md OS-3): src/content/docs/x.md is /docs/x/.
export const contentDir = join(siteDir, 'src', 'content', 'docs');
/** URL path of the docs section of the one website (OS-3); public/ files are served under it too. */
export const BASE = '/docs';
/** URL path of the live example frames (public/examples). */
export const EXAMPLES_URL = `${BASE}/examples`;
export const generatedDir = join(siteDir, 'src', 'generated');
export const publicDir = join(siteDir, 'public');
export const dataDir = join(siteDir, 'data');
export const cacheDir = join(root, '.cache', 'site');

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function clean(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

/** Component names, from the metadata directory (the source of truth). */
export function componentNames() {
  return readdirSync(metaDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'schema')
    .map((d) => d.name)
    .sort();
}

export function loadComponent(name) {
  const dir = join(metaDir, name);
  return {
    name,
    component: readJson(join(dir, 'component.json')),
    api: readJson(join(dir, 'api.json')),
    accessibility: readJson(join(dir, 'accessibility.json')),
    tokens: readJson(join(dir, 'tokens.json')),
    examples: readJson(join(dir, 'examples.json')),
    doc: readFileSync(join(docsSrcDir, `${name}.md`), 'utf8'),
  };
}

/** Escape a value for a Markdown table cell. */
export function cell(value) {
  return stripSpec(String(value ?? ''))
    .replace(/\r?\n/g, ' ')
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/</g, '&lt;')))
    .join('')
    .replace(/\|/g, '\\|');
}

/** Inline code for a table cell (pipes escaped). */
export function code(value) {
  const text = String(value ?? '');
  if (!text) return '';
  const fence = text.includes('`') ? '``' : '`';
  return `${fence}${text.replace(/\|/g, '\\|')}${fence}`;
}

/** Escape text for YAML frontmatter (JSON strings are valid YAML scalars). */
export const yaml = (value) => JSON.stringify(String(value));

/** First sentence, for page descriptions. */
export function firstSentence(text) {
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return (match ? match[1] : text).trim();
}

/**
 * Make authored Markdown safe for the site: escape raw `<` outside code (the
 * docs mention types such as <HTMLElement> in prose), drop references to the
 * internal specification, and rewrite links between component docs.
 */
export function sanitizeMarkdown(md) {
  const lines = md.split(/\r?\n/);
  let fence = null;
  const out = [];
  for (const line of lines) {
    const fenceMatch = /^(\s*)(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[2];
      else if (line.trim().startsWith(fence)) fence = null;
      out.push(line);
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }
    out.push(
      line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => (i % 2 === 1 ? part : prose(part)))
        .join(''),
    );
  }
  return out.join('\n');
}

/** Remove references to the internal specification (specification sections are not published). */
export function stripSpec(text) {
  return text
    .replace(/\s*\((?:see )?SPEC section [^)]*\)/g, '')
    .replace(/[,;]\s*(?:see )?SPEC section [\d.]+(?:(?:,| and| or) section [\d.]+)*(?=\))/g, '')
    .replace(/SPEC section [\d.]+(?:(?:,| and| or) section [\d.]+)*/g, 'the AbsoluteUI specification');
}

function prose(text) {
  return stripSpec(text)
    .replace(/\]\(([a-z0-9-]+)\.md(#[^)]*)?\)/g, (_, name, hash) => `](/docs/components/${name}/${hash ?? ''})`)
    .replace(/</g, '&lt;');
}
