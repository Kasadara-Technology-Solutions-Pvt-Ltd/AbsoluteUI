// Browser support matrix gate (SPEC section 3.2, R15-1). Every catalogued platform feature the
// published packages use without a declared fallback must be supported at the stated minimum,
// and the minimum in docs/browser-support.json must be exactly the newest version they need.
//   node scripts/check-browser-support.mjs          check
//   node scripts/check-browser-support.mjs --print  show the computed matrix and the features in use
import { browserSupport, compareVersions, version } from './browser-support.mjs';
import { fail } from './lib.mjs';

const { config, used, unknown } = browserSupport();
const browsers = Object.keys(config.browsers);
const errors = unknown.map((id) => `${id}: not in web-features; fix the id in docs/browser-support.json`);

const required = used.filter((f) => !f.fallback);
const computed = Object.fromEntries(browsers.map((b) => [b, '']));
for (const f of required) {
  for (const b of browsers) {
    const v = f.support[b];
    if (!v) { errors.push(`${f.id} (${f.files[0]}): not supported in ${config.browsers[b].name}; add a fallback or stop using it`); continue; }
    if (!computed[b] || compareVersions(v, computed[b]) > 0) computed[b] = version(v);
  }
}
for (const b of browsers) {
  const stated = config.browsers[b].minimum;
  if (stated !== computed[b]) errors.push(`${config.browsers[b].name}: minimum is "${stated}" but the features in use need ${computed[b]} (docs/browser-support.json)`);
}

if (process.argv.includes('--print')) {
  console.log('computed minimum:', JSON.stringify(computed));
  for (const f of used) console.log(`${f.fallback ? 'fallback' : 'required'}  ${f.id.padEnd(24)} ${browsers.map((b) => `${b}=${f.support[b] ?? '-'}`).join(' ')}  (${f.files.length} files)`);
}
if (errors.length) fail(errors);
console.log(`check:browsers: ok (${required.length} required features, ${used.length - required.length} with fallbacks)`);
