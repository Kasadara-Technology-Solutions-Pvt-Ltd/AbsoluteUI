// Post-build: add the SHA-256 hash of every inline <script> and <style> element to its
// page's CSP <meta>, so the policy never needs 'unsafe-inline' (R4-8). Idempotent.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { distDir, walk } from './lib/shared.mjs';

const META = /(<meta http-equiv="content-security-policy" content=")([^"]*)(")/i;
const hash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** Hashes of inline elements (scripts without src, excluding data blocks) as the browser sees them. */
export function inlineHashes(html) {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/type="(application\/(ld\+)?json|importmap)"/i.test(m[1]))
    .map((m) => hash(m[2]));
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => hash(m[1]));
  return { scripts, styles };
}

function addSources(policy, directive, sources) {
  const parts = policy.split(';').map((p) => p.trim()).filter(Boolean);
  const index = parts.findIndex((p) => p.split(/\s+/)[0] === directive);
  if (index < 0) {
    if (sources.length) parts.push(`${directive} 'self' ${sources.join(' ')}`);
  } else {
    const existing = new Set(parts[index].split(/\s+/).slice(1));
    for (const s of sources) existing.add(s);
    parts[index] = `${directive} ${[...existing].join(' ')}`;
  }
  return parts.join('; ');
}

if (process.argv[1]?.endsWith('csp-inline.mjs')) {
  let pages = 0;
  for (const file of walk(distDir).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const meta = META.exec(html);
    if (!meta) continue;
    const { scripts, styles } = inlineHashes(html);
    let policy = addSources(meta[2], 'script-src', scripts);
    policy = addSources(policy, 'style-src', styles);
    if (policy !== meta[2]) {
      writeFileSync(file, html.replace(META, `$1${policy}$3`));
      pages++;
    }
  }
  console.log(`csp-inline: updated ${pages} page(s)`);
}
