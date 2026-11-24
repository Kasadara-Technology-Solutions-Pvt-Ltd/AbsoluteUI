// Shared paths and helpers for the marketing site build (R4 phase C).
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const root = resolve(appDir, '..', '..');
export const componentsDir = join(root, 'packages', 'components');
export const metaDir = join(componentsDir, 'metadata');
export const publicDir = join(appDir, 'public');
export const generatedDir = join(appDir, 'src', 'generated');
export const dataDir = join(appDir, 'data');
export const distDir = join(appDir, 'dist');
export const cacheDir = join(root, '.cache', 'marketing');
/** Evidence recorded by the e2e suite (tests/e2e/evidence-reporter.ts), copied by `npm run site:evidence`. */
export const evidenceFile = join(root, 'apps', 'site', 'data', 'evidence.json');

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function clean(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
}

/** Component names, from the metadata directory (the source of truth). */
export function componentNames() {
  return readdirSync(metaDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'schema')
    .map((d) => d.name)
    .sort();
}

/** External links (links.json). In dev, the local dev-server URLs replace docs and designer links. */
export function loadLinks({ dev = false } = {}) {
  const links = readJson(join(appDir, 'links.json'));
  const { dev: local, ...rest } = links;
  const base = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== '$comment'));
  return dev ? { ...base, ...local } : base;
}

/** Placeholder values: anything on the reserved .invalid top-level domain (RFC 2606). */
export function placeholders(links) {
  const out = [];
  for (const [key, value] of Object.entries(links)) {
    if (typeof value !== 'string') continue;
    // Root-relative paths are sections of the one website (docs/PLAN-ONE-SITE.md), never placeholders.
    if (value.startsWith('/') && !value.startsWith('//')) continue;
    try {
      if (new URL(value).hostname.endsWith('.invalid')) out.push(`${key} = ${value}`);
    } catch {
      out.push(`${key} is not a URL (${value})`);
    }
  }
  return out;
}

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
