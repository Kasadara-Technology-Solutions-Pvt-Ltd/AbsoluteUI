// Production build: minified ESM (module boundaries preserved), compiled CSS,
// license banners, private source maps (SPEC section 5.3), license files (§5.3.3).
import { build } from 'esbuild';
import * as sass from 'sass';
import { copyFileSync, mkdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transform } from 'esbuild';
import { root, packageNames, esbuildPackageNames, readJson, walk, banner, rel } from './lib.mjs';

const privateMaps = join(root, '.private-sourcemaps');

async function buildJs(name) {
  const pkgDir = join(root, 'packages', name);
  const pkg = readJson(join(pkgDir, 'package.json'));
  const srcDir = join(pkgDir, 'src');
  const distDir = join(pkgDir, 'dist');
  const entryPoints = walk(srcDir, (f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  await build({
    entryPoints,
    outdir: distDir,
    outbase: srcDir,
    bundle: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    minify: true,
    sourcemap: 'external',
    legalComments: 'inline',
    banner: { js: banner(pkg.name, pkg.version) },
    logLevel: 'warning',
  });
  for (const map of walk(distDir, (f) => f.endsWith('.map'))) {
    const target = join(privateMaps, name, relative(distDir, map));
    mkdirSync(dirname(target), { recursive: true });
    renameSync(map, target);
  }
  return pkg;
}

function compileScss(entry, outFile, pkg, loadPaths) {
  const result = sass.compile(entry, { style: 'compressed', sourceMap: true, sourceMapIncludeSources: true, loadPaths });
  const css = result.css.replace(/^@charset "UTF-8";/, '').replace(new RegExp('^' + String.fromCharCode(0xfeff)), '');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${banner(pkg.name, pkg.version)}\n${css}\n`);
  const mapTarget = join(privateMaps, rel(outFile).replace(/^packages\//, '').replace('/dist/', '/') + '.map');
  mkdirSync(dirname(mapTarget), { recursive: true });
  writeFileSync(mapTarget, JSON.stringify(result.sourceMap));
}

async function buildTheme(pkg) {
  const themeDir = join(root, 'packages', 'theme');
  const distScss = join(themeDir, 'dist', 'scss');
  mkdirSync(distScss, { recursive: true });
  for (const file of walk(join(themeDir, 'src', 'scss'), (f) => f.endsWith('.scss'))) {
    copyFileSync(file, join(distScss, relative(join(themeDir, 'src', 'scss'), file)));
  }
  const { themes, tokensToScss, tokensToJson, componentTokensToScss } = await import(pathToFileURL(join(themeDir, 'dist', 'index.js')).href);
  writeFileSync(join(distScss, '_generated-tokens.scss'), tokensToScss(Object.values(themes)));
  writeFileSync(join(distScss, '_generated-component-tokens.scss'), componentTokensToScss());
  writeFileSync(join(themeDir, 'dist', 'tokens.json'), tokensToJson(Object.values(themes)));
  // Opt-in web font loaders (SPEC section 10.1); absolute-default.css itself never requests one.
  const { notoSansStylesheet, webFontsToCss } = await import(pathToFileURL(join(themeDir, 'dist', 'index.js')).href);
  mkdirSync(join(themeDir, 'dist', 'fonts'), { recursive: true });
  writeFileSync(join(themeDir, 'dist', 'fonts', 'noto-sans.css'), `${banner(pkg.name, pkg.version)}
${webFontsToCss([{ provider: 'google', family: 'Noto Sans', stylesheet: notoSansStylesheet }])}
`);
  const { themeJsonSchema } = await import(pathToFileURL(join(themeDir, 'dist', 'designer', 'index.js')).href);
  writeFileSync(join(themeDir, 'dist', 'theme.schema.json'), `${JSON.stringify(themeJsonSchema(), null, 2)}
`);
  compileScss(join(distScss, 'absolute-default.scss'), join(themeDir, 'dist', 'absolute-default.css'), pkg, [distScss]);
  return distScss;
}

function buildComponentStyles(pkg, themeScss) {
  const pkgDir = join(root, 'packages', 'components');
  for (const entry of walk(join(pkgDir, 'src'), (f) => f.endsWith('style.scss'))) {
    const out = join(pkgDir, 'dist', relative(join(pkgDir, 'src'), entry)).replace(/\.scss$/, '.css');
    compileScss(entry, out, pkg, [themeScss]);
  }
}

const pkgs = {};
for (const name of esbuildPackageNames) pkgs[name] = await buildJs(name);
const themeScss = await buildTheme(pkgs.theme);
buildComponentStyles(pkgs.components, themeScss);

// Angular adapter (SPEC section 22): ngc partial compilation (Angular Package Format linker
// input), then minified like every other package. check:angular proves the minified
// output still links with the Angular linker.
{
  const pkgDir = join(root, 'packages', 'angular');
  const pkg = readJson(join(pkgDir, 'package.json'));
  const ngc = join(root, 'node_modules', '@angular', 'compiler-cli', 'bundles', 'src', 'bin', 'ngc.js');
  execFileSync(process.execPath, [ngc, '-p', join(pkgDir, 'tsconfig.lib.json')], { stdio: 'inherit' });
  for (const file of walk(join(pkgDir, 'dist'), (f) => f.endsWith('.js'))) {
    // The Angular linker requires string literals in partial declarations (bundled component styles
    // contain newlines, which esbuild would otherwise turn into template literals). charset utf8:
    // consumers' Angular builds only link files that contain the literal "\u0275\u0275ngDeclare" prefix,
    // and esbuild's default ASCII output would escape it (M7 pilot finding).
    const result = await transform(readFileSync(file, 'utf8'), { format: 'esm', target: 'es2022', minify: true, legalComments: 'inline', loader: 'js', charset: 'utf8', supported: { 'template-literal': false } });
    writeFileSync(file, `${banner(pkg.name, pkg.version)}
${result.code}`);
  }
  pkgs.angular = pkg;
}

// MCP server (R15): one Node bundle, then the content snapshot built from the packages above.
execFileSync(process.execPath, [join(root, 'packages', 'mcp', 'scripts', 'build.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'packages', 'mcp', 'scripts', 'build-content.mjs')], { stdio: 'inherit' });

const license = readFileSync(join(root, 'LICENSE'));
const notice = readFileSync(join(root, 'NOTICE'));
const security = readFileSync(join(root, 'SECURITY.md'));
for (const name of packageNames) {
  writeFileSync(join(root, 'packages', name, 'LICENSE'), license);
  writeFileSync(join(root, 'packages', name, 'NOTICE'), notice);
  writeFileSync(join(root, 'packages', name, 'SECURITY.md'), security);
}
console.log('build: ok');
