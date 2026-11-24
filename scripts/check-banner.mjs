// SPEC section 5.5 / §5.3.1: every shipped JS/CSS file starts with the license banner
// and contains no sourceMappingURL reference.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { root, packageNames, walk, rel, BANNER_PREFIX, fail } from './lib.mjs';

const errors = [];
let count = 0;
for (const name of packageNames) {
  for (const file of walk(join(root, 'packages', name, 'dist'), (f) => /\.(js|css)$/.test(f))) {
    count++;
    const text = readFileSync(file, 'utf8');
    // An executable (the MCP server bin) starts with its shebang line, then the banner.
    const body = text.startsWith('#!') ? text.slice(text.indexOf(String.fromCharCode(10)) + 1) : text;
    if (!body.startsWith(BANNER_PREFIX)) errors.push(`${rel(file)}: missing license banner`);
    if (/sourceMappingURL/.test(text)) errors.push(`${rel(file)}: contains sourceMappingURL`);
  }
}
if (count === 0) errors.push('no built files found; run npm run build first');
if (errors.length) fail(errors);
console.log(`check:banner: ok (${count} files)`);
