// Live examples (R4-3): the type-checked examples from metadata/<name>/examples.json,
// each bundled into its own isolated page that loads only AbsoluteUI CSS, under the
// same strict CSP and Trusted Types policy as the e2e harness.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import { BASE, EXAMPLES_URL, cacheDir, clean, componentsDir, publicDir, root, siteDir, stripSpec, write } from './shared.mjs';
import { headerStyles } from './components.mjs';

const outDir = join(publicDir, 'examples');
const entryDir = join(cacheDir, 'examples');

export const CSP = [
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

/** Components whose examples open popups; their frames start taller so popups fit. */
export const POPUP = new Set(['select', 'combobox', 'multi-select', 'date-picker', 'date-time-picker', 'time-picker', 'date-range-picker', 'month-picker', 'year-picker', 'quarter-picker', 'duration-picker', 'menu', 'menu-bar', 'context-menu', 'popover', 'tooltip', 'hover-card', 'dialog', 'drawer', 'bottom-sheet', 'session-warning-dialog', 'schedule-picker', 'recurrence-picker', 'rich-text-editor']);

export const escapeHtml = (s) => stripSpec(String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * An example renders live when it creates a component (generic calls such as
 * `DataGrid.create<Row>(` included). Configuration-only examples, and examples that
 * call a server (`fetch`), are shown as code only: the static site has no backend, and
 * a mocked one would misrepresent the component. So are examples that `declare const` a
 * value the application supplies (a data provider, for example): they have nothing to run.
 */
const renders = (code) => /\.create(?:<[^<>()]*>)?\(/.test(code) && !/\bfetch\(/.test(code) && !/^declare const /m.test(code);

function copyStyles(docs) {
  const css = join(outDir, 'css');
  mkdirSync(css, { recursive: true });
  const dist = join(componentsDir, 'dist');
  for (const name of readdirSync(dist)) {
    const file = join(dist, name, 'style.css');
    if (existsSync(file)) copyFileSync(file, join(css, `${name}.css`));
  }
  copyFileSync(join(root, 'packages', 'theme', 'dist', 'absolute-default.css'), join(css, 'theme.css'));
  copyFileSync(join(siteDir, 'src', 'examples', 'base.css'), join(css, 'base.css'));
  // Noto Sans (the theme's default family), self-hosted: no third-party requests (R4-8).
  const fontPkg = join(root, 'node_modules', '@fontsource-variable', 'noto-sans');
  const fonts = join(outDir, 'fonts');
  mkdirSync(fonts, { recursive: true });
  const faces = readFileSync(join(fontPkg, 'index.css'), 'utf8').replace(/'Noto Sans Variable'/g, "'Noto Sans'");
  for (const m of faces.matchAll(/url\(\.\/files\/([^)]+)\)/g)) copyFileSync(join(fontPkg, 'files', m[1]), join(fonts, m[1]));
  write(join(css, 'fonts.css'), faces.replace(/url\(\.\/files\//g, 'url(../fonts/'));
  // Style chains per component, from each doc header.
  const chains = new Map();
  for (const [name, md] of docs) chains.set(name, headerStyles(md).map((spec) => /@absoluteui\/components\/([^/]+)\/style\.css/.exec(spec)?.[1]).filter(Boolean));
  return chains;
}

/** Stylesheets of components an entry point builds on (they have no stylesheet of their own). */
const ENTRY_STYLES = new Map([
  ['data-grid/editors', ['combobox', 'multi-select']],
  ['data-grid/accessories', ['menu', 'context-menu', 'dialog', 'button', 'tooltip']],
  ['data-grid/charts', ['sparkline', 'bar-chart', 'line-chart', 'pie-chart']],
  ['dashboard/widgets', ['stat-card', 'sparkline', 'bar-chart', 'line-chart', 'pie-chart', 'gauge', 'bullet-chart', 'data-table', 'progress-bar']],
  ['dashboard/builder', ['drawer', 'tabs', 'textarea', 'file-upload', 'inline-message', 'select', 'multi-select', 'text-input', 'number-input', 'switch', 'button']],
]);

function stylesFor(code, chains) {
  const out = [];
  const add = (css) => {
    if (!out.includes(css) && existsSync(join(outDir, 'css', `${css}.css`))) out.push(css);
  };
  for (const m of code.matchAll(/from '@absoluteui\/components\/([a-z-]+)(?:\/([a-z-]+))?'/g)) {
    for (const css of chains.get(m[1]) ?? [m[1]]) add(css);
    for (const css of (m[2] ? ENTRY_STYLES.get(`${m[1]}/${m[2]}`) : undefined) ?? []) add(css);
  }
  return out;
}

/** PNG image (RGB, gradient) as a placeholder for image paths used by examples. */
function placeholderPng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      rows[row + 1 + x * 3] = Math.round(124 + (20 - 124) * t);
      rows[row + 2 + x * 3] = Math.round(107 + (184 - 107) * t);
      rows[row + 3 + x * 3] = Math.round(255 + (166 - 255) * t);
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** Write placeholder images for root-relative image paths in examples ('/images/x.png'). */
function writeImages(code) {
  for (const m of code.matchAll(/'(\/images\/[\w-]+\.png)'/g)) {
    const file = join(publicDir, m[1]);
    if (!existsSync(file)) write(file, placeholderPng(640, 360));
  }
}

/** Elements for each type an example may look up by id. */
const TAGS = { HTMLFormElement: 'form', HTMLInputElement: 'input', HTMLButtonElement: 'button', HTMLUListElement: 'ul', HTMLOListElement: 'ol', HTMLTableElement: 'table', HTMLDialogElement: 'dialog', HTMLTextAreaElement: 'textarea', HTMLSelectElement: 'select', HTMLAnchorElement: 'a', HTMLSpanElement: 'span' };

/**
 * Host elements an example expects in the page (`querySelector<T>('#id')` or
 * `getElementById('id')`), created empty with the right tag. Returns null when the
 * example needs markup inside its host, which a generated page cannot know.
 */
function hostsFor(code) {
  if (/(\?|\))\.querySelector|host\.querySelector/.test(code)) return null;
  const hosts = [];
  for (const m of code.matchAll(/(?:querySelector(?:<(\w+)>)?\(\s*'#([\w-]+)'\s*\)|getElementById\(\s*'([\w-]+)'\s*\))/g)) {
    const id = m[2] ?? m[3];
    if (hosts.some((h) => h.id === id)) continue;
    const tag = TAGS[m[1] ?? ''] ?? 'div';
    hosts.push({ id, tag });
  }
  // Links looked up by their target (`a[href="/u/ada"]`), with the last path segment as text.
  for (const m of code.matchAll(/querySelector(?:<\w+>)?\(\s*'a\[href="([^"]+)"\]'\s*\)/g)) {
    const text = m[1].split('/').filter(Boolean).pop() ?? m[1];
    hosts.push({ href: m[1], text: text[0].toUpperCase() + text.slice(1) });
  }
  return hosts;
}

/** Text of a generated button host: the last word of its id (`signup-next` -> `Next`). */
const buttonText = (id) => {
  const word = id.split('-').pop() ?? id;
  return word[0].toUpperCase() + word.slice(1);
};

const hostMarkup = (hosts) =>
  hosts
    .map((h) => {
      if (h.href) return `<p><a href="${escapeHtml(h.href)}">${escapeHtml(h.text)}</a></p>`;
      if (h.tag === 'input') return `<input id="${h.id}">`;
      // A button the application owns: styled as an AbsoluteUI button, like the examples' own buttons.
      if (h.tag === 'button') return `<button type="button" id="${h.id}" class="aui-button aui-button--secondary aui-button--md">${escapeHtml(buttonText(h.id))}</button>`;
      return `<${h.tag} id="${h.id}"></${h.tag}>`;
    })
    .join('\n');

function page(component, example, styles, hosts, meta = '') {
  const own = hosts.some((h) => h.tag === 'button') && !styles.includes('button') ? ['button'] : [];
  const links = ['fonts', 'theme', 'base', ...styles, ...own].map((s) => `<link rel="stylesheet" href="../css/${s}.css">`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="robots" content="noindex">
${meta}<title>${escapeHtml(example.title)} | ${escapeHtml(component)} example</title>
${links}
<script type="module" src="../js/${component}--${example.id}.js"></script>
</head>
<body>
${hostMarkup(hosts)}
</body>
</html>
`;
}

/**
 * Bundle every rendering example and write its page. Returns the Markdown block
 * per component (frame plus source).
 * @param {Map<string, { displayName?: string, examples: Array<{ id: string, title: string, code: string }> }>} components
 * @param {Map<string, string>} docs Authored docs by name (for style chains).
 */
export async function buildExamples(components, docs, extras = [], showcases = [], kit = null, playgrounds = []) {
  clean(outDir);
  clean(entryDir);
  const chains = copyStyles(docs);
  const runtime = join(siteDir, 'src', 'examples', 'runtime.ts').replace(/\\/g, '/');
  const entries = [];
  const blocks = new Map();
  // Site-owned live frames that are not component examples (e.g. the icon gallery, PLAN-R7 D5):
  // `{ name, id, title, file }`, where `file` is a type-checked module under src/examples.
  for (const ex of extras) {
    const source = readFileSync(ex.file, 'utf8');
    const hosts = hostsFor(source) ?? [];
    const file = join(entryDir, `${ex.name}--${ex.id}.ts`);
    write(file, `import '${runtime}';\nimport '${ex.file.replace(/\\/g, '/')}';\n`);
    entries.push(file);
    // Component stylesheets the module imports (for example the gallery's search field).
    write(join(outDir, ex.name, `${ex.id}.html`), page(ex.name, ex, stylesFor(source, chains), hosts));
    blocks.set(ex.name, [`<figure class="aui-live" data-min-height="360"><iframe data-src="${EXAMPLES_URL}/${ex.name}/${ex.id}.html" title="Live example: ${escapeHtml(ex.title)}" loading="lazy"></iframe></figure>`, '']);
  }
  // Showcases (R19): one frame per group, embedded first on every component page it covers.
  // A showcase that covers several components opens on each page in focus mode (R20-26):
  // `?focus=<name>` shows only the sections that declare that component (src/showcases/kit.ts).
  const showcaseBlocks = new Map();
  const kitSource = kit ? readFileSync(kit, 'utf8') : '';
  for (const sc of showcases) {
    const source = readFileSync(sc.file, 'utf8');
    const file = join(entryDir, `showcase--${sc.id}.ts`);
    write(file, `import '${runtime}';\nimport '${sc.file.replace(/\\/g, '/')}';\n`);
    entries.push(file);
    const displayNames = Object.fromEntries(sc.components.map((n) => [n, components.get(n)?.displayName ?? n]));
    const meta = `<meta name="aui-component-names" content="${escapeHtml(JSON.stringify(displayNames))}">\n`;
    write(join(outDir, 'showcase', `${sc.id}.html`), page('showcase', { id: sc.id, title: sc.title }, stylesFor(`${kitSource}\n${source}`, chains), [], meta));
    const frame = (name) => {
      if (sc.components.length === 1) {
        return [
          `#### Showcase: ${escapeHtml(sc.title)}`,
          '',
          'A fully featured live example. Change its options, use it with the keyboard, and watch the event log. The bar above the frame switches theme, density, direction, and locale.',
          '',
          `<figure class="aui-live aui-live--showcase" data-min-height="${sc.minHeight}"><iframe data-src="${EXAMPLES_URL}/showcase/${sc.id}.html" title="Showcase: ${escapeHtml(sc.title)}" loading="lazy"></iframe></figure>`,
        ];
      }
      const display = escapeHtml(displayNames[name]);
      // The focused view is much shorter than the whole showcase; the frame grows to fit it.
      const min = Math.min(sc.minHeight, POPUP.has(name) ? 700 : 420);
      return [
        `#### ${display} in the ${escapeHtml(sc.title)} showcase`,
        '',
        `The part of the ${escapeHtml(sc.title)} showcase that uses ${display}. Change its options, use it with the keyboard, and watch the event log; the link in the frame opens the full showcase. The bar above the frame switches theme, density, direction, and locale.`,
        '',
        `<figure class="aui-live aui-live--showcase" data-min-height="${min}"><iframe data-src="${EXAMPLES_URL}/showcase/${sc.id}.html?focus=${name}" title="Showcase: ${display} in ${escapeHtml(sc.title)}" loading="lazy"></iframe></figure>`,
      ];
    };
    const sourceBlock = [
      '',
      '<details class="aui-showcase-source"><summary>Showcase source</summary>',
      '',
      '```ts',
      source.trim(),
      '```',
      '',
      '</details>',
      '',
    ];
    for (const name of sc.components) showcaseBlocks.set(name, [...(showcaseBlocks.get(name) ?? []), ...frame(name), ...sourceBlock]);
  }
  // Playgrounds (R20-7): one generated frame per component with a seed.
  const playgroundBlocks = new Map();
  const pgRuntime = join(siteDir, 'src', 'playground', 'runtime.ts').replace(/\\/g, '/');
  const pgSources = [kitSource, readFileSync(pgRuntime, 'utf8')].join('\n');
  for (const pg of playgrounds) {
    const seedFile = pg.seed.replace(/\\/g, '/');
    const file = join(entryDir, `playground--${pg.name}.ts`);
    write(file, `import '${runtime}';\nimport { runPlayground } from '${pgRuntime}';\nimport seed from '${seedFile}';\nrunPlayground(seed, ${JSON.stringify(pg.spec)});\n`);
    entries.push(file);
    write(join(outDir, 'playground', `${pg.name}.html`), page('playground', { id: pg.name, title: `${pg.spec.displayName} playground` }, stylesFor(`${pgSources}\n${readFileSync(pg.seed, 'utf8')}`, chains), []));
    playgroundBlocks.set(pg.name, [
      `<figure class="aui-live aui-live--playground" data-min-height="${POPUP.has(pg.name) ? 640 : 560}"><iframe data-src="${EXAMPLES_URL}/playground/${pg.name}.html" title="${escapeHtml(pg.spec.displayName)} playground" loading="lazy"></iframe></figure>`,
      '',
    ]);
  }
  for (const [name, { examples }] of components) {
    const md = [];
    for (const ex of examples) {
      const hosts = hostsFor(ex.code);
      if (renders(ex.code) && hosts) {
        const file = join(entryDir, `${name}--${ex.id}.ts`);
        // Root-relative image paths in the shown code ('/images/x.png') are served under the docs base (OS-3).
        write(file, `import '${runtime}';\n${ex.code.replaceAll("'/images/", `'${BASE}/images/`)}\n`);
        entries.push(file);
        writeImages(ex.code);
        write(join(outDir, name, `${ex.id}.html`), page(name, ex, stylesFor(ex.code, chains), hosts));
        const min = POPUP.has(name) ? 440 : 180;
        md.push(
          `#### ${escapeHtml(ex.title)}`,
          '',
          `<figure class="aui-live" data-min-height="${min}"><iframe data-src="${EXAMPLES_URL}/${name}/${ex.id}.html" title="Live example: ${escapeHtml(ex.title)}" loading="lazy"></iframe></figure>`,
          '',
        );
      } else {
        md.push(`#### ${escapeHtml(ex.title)}`, '');
      }
      md.push('```ts', ex.code, '```', '');
    }
    blocks.set(name, md);
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
    tsconfig: join(siteDir, 'src', 'examples', 'tsconfig.json'),
    logLevel: 'warning',
  });
  return { blocks, showcaseBlocks, playgroundBlocks, count: entries.length, showcases: showcases.length };
}
