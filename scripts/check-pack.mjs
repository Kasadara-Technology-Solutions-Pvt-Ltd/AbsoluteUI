// SPEC section 5.3.2 / §5.3.3: published packages contain only release artifacts.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, packageNames, adapterPeers, readJson, fail } from './lib.mjs';

const allowed = [
  /^package\.json$/,
  /^LICENSE$/,
  /^NOTICE$/,
  /^SECURITY\.md$/,
  /^README\.md$/,
  /^dist\/.+\.js$/,
  /^dist\/.+\.d\.ts$/,
  /^dist\/.+\.css$/,
  /^dist\/scss\/.+\.scss$/,
  /^dist\/tokens\.json$/,
  /^dist\/theme\.schema\.json$/,
  /^dist\/content\.json$/,
  /^metadata\/.+\.json$/,
];
const required = ['package.json', 'LICENSE', 'NOTICE', 'SECURITY.md'];
// Every package publishes to the private feed only, never to the public npm registry.
const { registry } = readJson(join(root, 'release.config.json'));
const errors = [];

for (const name of packageNames) {
  const pkgDir = join(root, 'packages', name);
  const pkg = readJson(join(pkgDir, 'package.json'));
  if (pkg.license !== 'Apache-2.0') errors.push(`${pkg.name}: license field must be "Apache-2.0"`);
  if (!Array.isArray(pkg.files)) errors.push(`${pkg.name}: missing files allowlist`);
  if (pkg.publishConfig?.registry !== registry) errors.push(`${pkg.name}: publishConfig.registry must be ${registry}`);
  // SPEC section 2.1: zero third-party runtime dependencies.
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      // A framework adapter may only peer-depend on its framework (SPEC section 22); it bundles nothing.
      if (field === 'peerDependencies' && adapterPeers[name]?.test(dep)) continue;
      if (!dep.startsWith('@absoluteui/')) errors.push(`${pkg.name}: third-party runtime dependency "${dep}" in ${field}`);
      else if (pkg[field][dep] !== pkg.version) errors.push(`${pkg.name}: ${dep} must be pinned to lockstep version ${pkg.version}`);
    }
  }
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8', shell: process.platform === 'win32' });
  const files = JSON.parse(out)[0].files.map((f) => f.path.split(String.fromCharCode(92)).join('/'));
  for (const f of files) {
    if (!allowed.some((re) => re.test(f))) errors.push(`${pkg.name}: unexpected file in package: ${f}`);
    if (f.endsWith('.map')) errors.push(`${pkg.name}: source map must not be published: ${f}`);
  }
  for (const r of required) if (!files.includes(r)) errors.push(`${pkg.name}: missing required file ${r}`);
  // Published packages carry their full documentation (scripts/generate-readmes.mjs, R14-4).
  if (pkg.private !== true && !files.includes('README.md')) errors.push(`${pkg.name}: missing README.md; run npm run generate:readmes`);
  if (!files.some((f) => f.startsWith('dist/'))) errors.push(`${pkg.name}: no dist files; run npm run build first`);
}
if (errors.length) fail(errors);
console.log('check:pack: ok');
