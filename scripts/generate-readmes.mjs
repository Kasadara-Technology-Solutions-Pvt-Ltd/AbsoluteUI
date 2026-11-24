// Package READMEs (docs/decisions/r14-publishing.md, R14-5): a short overview of each published
// package and a list of what it contains. Lists that follow the code (helpers modules, components,
// Angular entry points) come from the package exports and metadata, so they never drift.
//   node scripts/generate-readmes.mjs           write packages/<name>/README.md
//   node scripts/generate-readmes.mjs --check   fail when a README is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson, fail } from './lib.mjs';
import { loadLegal } from './legal.mjs';
import { CATEGORIES as ICON_CATALOG, OVERLAYS as ICON_OVERLAYS } from './icons/catalog-source.mjs';
import { HELPER_MODULES } from '../apps/site/scripts/lib/helper-modules.mjs';
import { ADDON_SUMMARIES, GROUPS } from '../apps/site/scripts/lib/components.mjs';
import { firstSentence, stripSpec } from '../apps/site/scripts/lib/shared.mjs';

const check = process.argv.includes('--check');
// Canonical host of the one website (docs/PLAN-ONE-SITE.md OS-2); the docs are its /docs/ section.
const DOCS = 'https://aui.kasadara.com';
// Browser support line (R15-1) from the matrix that check:browsers enforces.
const { browsers } = readJson(join(root, 'docs', 'browser-support.json'));
const supportLine = `${Object.values(browsers).map((b) => `${b.name} ${b.minimum}`).join(', ')}, or later. Details: [Browser support](${DOCS}/docs/quality/browser-support/).`;
const metaDir = join(root, 'packages', 'components', 'metadata');
/** First sentence; a long one is cut at its first clause break. `<` is escaped so tags in prose stay text. */
function oneLine(text) {
  let s = firstSentence(stripSpec(String(text).replace(/\s+/g, ' ')));
  // "WAI-ARIA APG Tabs: a labelled tablist ..." -> "A labelled tablist ..."
  s = s.replace(/^WAI-ARIA [^:]{0,30}: (.)/, (_, c) => c.toUpperCase());
  if (s.length > 140) {
    const cuts = [': ', ', with ', ', built ', ', or ', ' ('].map((c) => s.indexOf(c, 30)).filter((i) => i > 0);
    if (cuts.length) s = `${s.slice(0, Math.min(...cuts))}.`;
  }
  if (s.length > 140 && s.indexOf(', ', 40) > 0) s = `${s.slice(0, s.indexOf(', ', 40))}.`;
  return s.replace(/</g, '&lt;');
}

function component(name) {
  const file = join(metaDir, name, 'component.json');
  if (!existsSync(file)) return { title: name.replace(/(^|-)(\w)/g, (_, s, c) => `${s ? ' ' : ''}${c.toUpperCase()}`).replace(/\bPdf\b/, 'PDF'), purpose: ADDON_SUMMARIES[name] ?? '' };
  const c = readJson(file);
  return { title: c.displayName, purpose: c.purpose };
}

const README = {
  helpers: (pkg) => {
    const modules = Object.keys(pkg.exports).filter((k) => k !== '.' && k !== './package.json').map((k) => k.slice(2)).sort();
    const missing = modules.filter((m) => !HELPER_MODULES[m]);
    if (missing.length) fail([`generate-readmes: add summaries for helpers modules: ${missing.join(', ')}`]);
    return [
      'Pure, zero-dependency helper functions and data structures for browsers, Node.js, workers, and server rendering. Each module is its own tree-shakeable subpath import with no side effects, and works on plain data, so results serialize cleanly.',
      '## What\'s in the package',
      modules.map((m) => `- **\`${pkg.name}/${m}\`**: ${HELPER_MODULES[m]}`).join('\n'),
    ];
  },
  core: () => [
    'The foundation every AbsoluteUI component builds on, available to applications too: one validated configuration, exact date and time-zone values, recurrence rules, localized formatting, safe HTML, and a shared error model.',
    '## What\'s in the package',
    [
      '- **Configuration**: global and per-component settings (locale, time zone, theme, density, animation) with validation, live change notifications, and component defaults.',
      '- **Dates and time zones**: plain dates, times, date-times, year-months, and quarters; instants and zoned date-times; time-zone conversion with daylight-saving gap and overlap handling.',
      '- **Recurrence**: RFC 5545 recurrence rules: build, parse, serialize, expand to dates, and describe in words.',
      '- **Internationalization**: translated messages with locale fallbacks, text direction, first day of the week, and number, currency, date, and time-zone formatting.',
      '- **Sanitization**: an allow-list HTML sanitizer that works with Trusted Types.',
      '- **Errors and diagnostics**: the `AbsoluteUIError` model with stable codes, and the diagnostics mode.',
      '- **DOM helpers**: unique ids, typed event dispatch, disposable listener groups, and node release hooks.',
    ].join('\n'),
  ],
  utilities: () => [
    'Framework-neutral interaction primitives used inside every component and available for your own widgets, so custom UI behaves the same way.',
    '## What\'s in the package',
    [
      '- **Focus**: focusable and tabbable detection, focus traps, and focus restoration.',
      '- **Keyboard**: roving tabindex, typeahead, index navigation, and hotkey matching.',
      '- **Positioning**: placement of popups next to an anchor, with automatic flipping.',
      '- **Overlays**: overlay layering, top-overlay checks, and popover opening.',
      '- **Drag**: pointer drag tracking.',
      '- **Observers**: resize, intersection, mutation, and media-query observers with clean-up.',
      '- **Motion**: reduced-motion detection and animation decisions.',
      '- **Accessibility**: screen-reader announcements, visually hidden text, and ARIA reference lists.',
      '- **Scroll lock**: page scroll locking for modal UI.',
    ].join('\n'),
  ],
  theme: () => [
    'The look of AbsoluteUI: built-in themes as design tokens, the runtime that applies them, accessibility checks for colors, and the Theme Designer engine for building your own theme families.',
    '## What\'s in the package',
    [
      '- **Built-in themes**: default, dark, and high contrast, with density variants, in one stylesheet (`absolute-default.css`).',
      '- **Theme runtime**: applies the configured theme, density, animation mode, and text direction to the page and keeps them in sync.',
      '- **Design tokens**: the token set, component tokens for per-component styling, optional tokens, and exports as CSS, SCSS, and JSON (`tokens.json`, `scss/`).',
      '- **Contrast checks**: color parsing, luminance, contrast ratios, foreground suggestions, and WCAG 2.2 AA evaluation of a whole theme.',
      '- **Custom themes**: register and validate your own themes.',
      '- **Web fonts**: the opt-in Noto Sans stylesheet and helpers for other font providers.',
      '- **Theme Designer engine** (`/designer`): theme families with light, dark, and high-contrast modes, OKLCH seed-to-role derivation, compliance assessment, import, and exports (theme JSON, CSS, SCSS, TypeScript, DTCG design tokens, and a package ZIP), with a published JSON Schema.',
    ].join('\n'),
  ],
  icons: () => [
    'The icon system every component uses: a built-in icon set, the AbsoluteUI icon set, and a registry that lets you add your own icons or plug in an icon library. No third-party icons are bundled.',
    '## What\'s in the package',
    [
      `- **AbsoluteUI icon set** (\`/set\`): ${String(ICON_CATALOG.reduce((n, c) => n + c.rows.length, 0))} original icons in ${String(ICON_CATALOG.length)} categories and ${String(ICON_OVERLAYS.length)} overlays, with outline, solid, duotone, and multicolor variants, color roles, overlays, and opt-in animation; import one icon per module or register the whole set by name (\`/set/register\`).`,
      '- **Built-in icons**: the icon set the components use.',
      '- **Icon registry**: register custom icons and resolve icon references.',
      '- **Icon library adapters**: use an icon library through a provider, with converters for Font Awesome definitions and SVG nodes.',
      '- **Rendering**: sizes, shape nodes, ligatures, and layered icons.',
    ].join('\n'),
  ],
  components: () => {
    // Add-on entry points (Data Grid editors, export, and so on) are listed but are not components.
    const total = GROUPS.reduce((n, [, list]) => n + list.filter((name) => !(name in ADDON_SUMMARIES)).length, 0);
    const out = [
      `${total} accessible, framework-neutral UI components. Each one renders into an element you own, works with any framework or none, follows WAI-ARIA patterns, is tested against WCAG 2.2 AA in three themes, and runs under a strict Content Security Policy with Trusted Types. Every component is its own subpath import with its own stylesheet.`,
      '## What\'s in the package',
    ];
    for (const [group, list] of GROUPS) out.push(`### ${group}`, list.map((n) => { const c = component(n); return `- **${c.title}**: ${oneLine(c.purpose)}`; }).join('\n'));
    return out;
  },
  angular: (pkg) => {
    const metas = Object.keys(pkg.exports)
      .filter((k) => k !== './package.json')
      .map((k) => join(root, 'packages', 'angular', 'metadata', `${k === '.' ? 'index' : k.slice(2).replace(/\//g, '-')}.json`))
      .filter((f) => existsSync(f))
      .map((f) => readJson(f));
    const byComponent = new Map();
    const integration = [];
    for (const m of metas) {
      const comp = m.declarations.find((d) => d.component)?.component;
      if (comp) byComponent.set(comp, m);
      else integration.push(m);
    }
    const out = [
      'AbsoluteUI for Angular 22: every component as a standalone Angular component or directive, with configuration through providers, form integration, signal inputs and two-way models, outputs, templates, router integration, and server rendering. The behavior comes from `@absoluteui/components`; this package adds everything Angular-specific.',
      '## What\'s in the package',
    ];
    for (const [group, list] of GROUPS) {
      const items = list.filter((n) => byComponent.has(n)).map((n) => {
        const decl = byComponent.get(n).declarations.find((d) => d.component === n) ?? byComponent.get(n).declarations[0];
        return `- **${component(n).title}**${decl.selector ? ` (\`${decl.selector}\`)` : ''}`;
      });
      if (items.length) out.push(`### ${group}`, items.join('\n'));
    }
    const exportsOf = (m) => [...m.declarations, ...(m.functions ?? [])].map((d) => d.name).concat(m.reexports ?? []);
    out.push('### Angular integration', integration.map((m) => `- **\`${m.entry}\`**: ${exportsOf(m).map((n) => `\`${n}\``).join(', ')}`).join('\n'));
    return out;
  },
  // R15: the local MCP server. The tool list comes from its contract snapshot, so it never drifts.
  mcp: () => {
    const contract = readJson(join(root, 'packages', 'mcp', 'contract.json'));
    return [
      'A local, read-only [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI coding assistants exact AbsoluteUI knowledge of this version (components, APIs, Angular bindings, guides, design tokens, icons) and checks their code. It runs on your machine over stdio: no network access, no telemetry, and it never reads your project files.',
      '## Set up',
      'Install it next to the other AbsoluteUI packages, at the same version:\n\n```sh\nnpm install --save-dev @absoluteui/mcp\n```\n\nClaude Code (writes `.mcp.json` at the project root):\n\n```sh\nclaude mcp add --transport stdio --scope project absoluteui -- npx absoluteui-mcp\n```\n\nVS Code (`.vscode/mcp.json`):\n\n```json\n{ "servers": { "absoluteui": { "type": "stdio", "command": "npx", "args": ["absoluteui-mcp"] } } }\n```\n\nAny other MCP client: a stdio server with the command `npx` and the argument `absoluteui-mcp`.',
      '## What\'s in the package',
      [
        `- **Tools**: ${contract.tools.map((t) => `\`${t.name}\``).join(', ')}.`,
        `- **Resources**: ${[...contract.fixedResources.map((r) => `\`${r.uri}\``), ...contract.resourceTemplates.map((t) => `\`${t.uriTemplate}\``)].join(', ')}.`,
        `- **Prompts**: ${contract.prompts.map((p) => `\`${p.name}\``).join(', ')}.`,
      ].join('\n'),
    ];
  },
};
/** Packages that run outside the browser state their runtime instead of the browser support line. */
const SUPPORT = { mcp: ['## Requirements', 'Node.js 22.22.3 or later in the 22 line, or 24.15.0 or later. MCP specification revisions 2026-07-28 and 2025-11-25.'] };

// License section (legal.json): the same terms, attribution, and links as the websites.
const legal = loadLegal();
const licenseText = `Licensed under the [Apache License 2.0](${legal.pages.license}). Copyright (c) ${legal.copyrightYear} ${legal.company}; see the LICENSE and NOTICE files in this package. AbsoluteUI is open source, Kasadara's contribution to the open-source community; the source is at ${legal.repository}. Report vulnerabilities as described in the [Security Policy](${legal.pages.security}).`;

const problems = [];
for (const [name, build] of Object.entries(README)) {
  const dir = join(root, 'packages', name);
  const pkg = readJson(join(dir, 'package.json'));
  if (pkg.private === true) continue;
  if (!pkg.homepage?.startsWith(`${DOCS}/`)) { problems.push(`${pkg.name}: package.json homepage must point into ${DOCS}/`); continue; }
  const docs = `Full documentation: [${pkg.homepage.slice('https://'.length)}](${pkg.homepage})`;
  const text = [`# ${pkg.name}`, ...build(pkg), ...(SUPPORT[name] ?? ['## Browser support', supportLine]), '## Documentation', docs, '## License', licenseText].join('\n\n').replace(/[ \t]+$/gm, '') + '\n';
  const file = join(dir, 'README.md');
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== text) problems.push(`${pkg.name}: README.md is out of date; run npm run generate:readmes`);
  } else {
    writeFileSync(file, text);
    console.log(`${pkg.name}: README.md ${(text.length / 1024).toFixed(1)} KB`);
  }
}
if (problems.length) fail(problems);
if (check) console.log('check:readmes: ok');
