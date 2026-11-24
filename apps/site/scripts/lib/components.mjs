// Component pages: authored docs (sections 1-33) plus API reference generated from
// metadata/<name>/*.json. Framework sections (34-37) are never published (R4-5).
import { join } from 'node:path';
import { cell, code, contentDir, firstSentence, sanitizeMarkdown, stripSpec, write, yaml } from './shared.mjs';
import { parseCriterion, wcagById } from './wcag.mjs';

/** Site navigation groups. Every component must be listed exactly once. */
export const GROUPS = [
  ['Forms', ['form', 'form-field', 'fieldset', 'validation-message', 'error-summary', 'text-input', 'textarea', 'number-input', 'slider', 'select', 'combobox', 'multi-select', 'checkbox', 'checkbox-group', 'radio-group', 'switch', 'rich-text-editor', 'schema-form', 'form-builder', 'masked-input', 'mention-input', 'rating', 'color-picker', 'cascader', 'transfer-list', 'signature-pad', 'tree-select']],
  ['Buttons', ['button', 'button-group', 'toggle-group']],
  ['Date and time', ['date-input', 'date-picker', 'date-time-picker', 'time-picker', 'calendar', 'date-range-picker', 'month-picker', 'year-picker', 'quarter-picker', 'duration-picker', 'recurrence-picker', 'schedule-picker', 'business-calendar']],
  ['Authentication', ['password-input', 'password-strength-meter', 'otp-input', 'session-warning-dialog']],
  ['Upload', ['file-upload', 'upload-queue']],
  ['Layout and content', ['layout', 'card', 'accordion', 'collapsible', 'scroll-area', 'typography', 'badge', 'kbd', 'avatar', 'avatar-group', 'tag-group', 'carousel', 'splitter', 'timeline', 'image-viewer', 'code-viewer']],
  ['Navigation', ['sidebar', 'menu-bar', 'menu', 'context-menu', 'tabs', 'breadcrumb', 'pagination', 'stepper', 'tree-view', 'command-palette']],
  ['Overlays', ['dialog', 'drawer', 'bottom-sheet', 'popover', 'tooltip', 'hover-card', 'tour']],
  ['Feedback', ['alert', 'inline-message', 'toast', 'progress-bar', 'spinner', 'skeleton', 'empty-state']],
  ['Data', ['data-table', 'data-grid', 'data-grid-editors', 'data-grid-accessories', 'data-grid-export', 'data-grid-pdf', 'data-grid-formulas', 'data-grid-charts', 'data-grid-schema', 'pivot-grid', 'virtual-list', 'file-manager', 'sortable-list', 'org-chart', 'org-chart-export', 'diagram']],
  ['Charts', ['line-chart', 'bar-chart', 'pie-chart', 'sparkline', 'scatter-chart', 'combo-chart', 'waterfall-chart', 'histogram', 'heatmap', 'gauge', 'radar-chart', 'treemap', 'funnel-chart', 'box-plot', 'bullet-chart', 'chart-export', 'candlestick-chart', 'network-graph', 'calendar-heatmap']],
  ['Dashboard', ['dashboard', 'dashboard-grid', 'dashboard-widget', 'stat-card']],
  ['Planning and boards', ['scheduler', 'kanban', 'gantt']],
  ['Conversation', ['chat', 'prompt-input', 'discussion']],
];

/** Split an authored doc into numbered sections. */
export function sections(md) {
  const out = new Map();
  const title = /^# (.+)$/m.exec(md)?.[1] ?? '';
  const parts = md.split(/^## (\d+)\. (.+)$/m);
  for (let i = 1; i < parts.length; i += 3) out.set(Number(parts[i]), { heading: parts[i + 1].trim(), body: parts[i + 2].trim() });
  return { title, sections: out };
}

/** Styles listed in the doc header ("Styles: `a`, `b`, and `c`"). */
export function headerStyles(md) {
  // The header separates fields with " | " (escaped here: a bare | would be an alternation).
  const line = /^> .*Styles?: (.+?)(?: \| |$)/m.exec(md)?.[1] ?? '';
  return [...line.matchAll(/`(@absoluteui\/[^`]+\.css)`/g)].map((m) => m[1]);
}

const section = (s, n) => {
  const body = s.get(n)?.body ?? '';
  return /^(none\.?|n\/a\.?|not applicable\.?)$/i.test(body.trim()) ? '' : sanitizeMarkdown(body);
};

function apiReference(api) {
  const out = ['## API reference', ''];
  out.push('### Factory', '', '```ts', api.factory.signature, '```', '');
  if (api.configKey) out.push(`Global configuration key: ${code(api.configKey)} (see [Configuration](/docs/getting-started/configuration/)).`, '');
  if (api.options.length) {
    out.push('### Options', '', '| Option | Type | Default | Description |', '|---|---|---|---|');
    for (const o of api.options) {
      const flags = [o.required ? '**Required.**' : '', o.globallyConfigurable ? 'Globally configurable.' : '', o.inheritedFromCommon ? 'Inherited from common configuration.' : '', o.mutability === 'init-only' ? 'Set at creation only.' : '']
        .filter(Boolean)
        .join(' ');
      const def = 'default' in o ? code(JSON.stringify(o.default)) : '';
      out.push(`| ${code(o.name)} | ${code(o.type)} | ${def} | ${cell([o.description, flags].filter(Boolean).join(' '))} |`);
    }
    out.push('');
  }
  if (api.properties.length) {
    out.push('### Properties', '', '| Property | Type | Description |', '|---|---|---|');
    for (const p of api.properties) out.push(`| ${code(p.name)} | ${code(p.type)} | ${cell(p.description)} |`);
    out.push('');
  }
  if (api.methods.length) {
    out.push('### Methods', '', '| Method | Description |', '|---|---|');
    for (const m of api.methods) out.push(`| ${code(m.signature)} | ${cell(m.description)} |`);
    out.push('');
  }
  if (api.events.length) {
    out.push('### Events', '', '| Event | Detail | Bubbles | Cancelable | Description |', '|---|---|---|---|---|');
    for (const e of api.events) out.push(`| ${code(e.name)} | ${code(e.detail)} | ${e.bubbles ? 'Yes' : 'No'} | ${e.cancelable ? 'Yes' : 'No'} | ${cell(e.description)} |`);
    out.push('');
  }
  if (api.contentAreas.length) {
    out.push('### Content areas', '', '| Area | Description |', '|---|---|');
    for (const c of api.contentAreas) out.push(`| ${code(c.name)} | ${cell(c.description)} |`);
    out.push('');
  }
  if (api.cssClasses.length) {
    out.push('### CSS classes', '', 'All rules live in the `aui.components` cascade layer, so application styles override them without specificity battles.', '', '| Class | Purpose |', '|---|---|');
    for (const c of api.cssClasses) out.push(`| ${code(c.name)} | ${cell(c.description)} |`);
    out.push('');
  }
  if (api.iconSlots.length) {
    out.push('### Icon slots', '', '| Slot | Default icon |', '|---|---|');
    for (const i of api.iconSlots) out.push(`| ${code(i.name)} | ${code(i.default)} |`);
    out.push('');
  }
  return out;
}

function tokenList(tokens) {
  if (!tokens.tokens.length) return [];
  return ['### Design tokens', '', 'Tokens this stylesheet reads (verified in CI). Override them in a theme or with the [Theme Designer](/docs/guides/theming/).', '', tokens.tokens.map((t) => code(`--aui-${t}`)).join(' | '), ''];
}

function accessibilityBlock(a11y, examples = {}) {
  const checked = [];
  if (examples.showcase?.length) checked.push('the showcase passes axe (WCAG 2.2 A and AA rules) in the default, dark, and high-contrast themes and right to left');
  if (examples.playground?.length) checked.push('the playground loads without errors and passes axe before and after every on/off option is switched');
  const out = ['## Accessibility and performance', '', '### Accessibility', '', `**Pattern:** ${sanitizeMarkdown(a11y.pattern)}`, ''];
  if (checked.length) out.push(`**Checked on every docs build:** ${checked.join('; ')}, with no Content Security Policy violations.`, '');
  if (a11y.keyboard?.length) {
    out.push('#### Keyboard', '', '| Key | Context | Action |', '|---|---|---|');
    for (const k of a11y.keyboard) out.push(`| ${cell(k.key)} | ${cell(k.context)} | ${cell(k.action)} |`);
    out.push('');
  }
  if (a11y.roles?.length) {
    out.push('#### Roles', '', '| Element | Role |', '|---|---|');
    for (const r of a11y.roles) out.push(`| ${cell(r.element)} | ${cell(r.role)} |`);
    out.push('');
  }
  if (a11y.aria?.length) {
    out.push('#### ARIA attributes', '', '| Attribute | Element | Value |', '|---|---|---|');
    for (const r of a11y.aria) out.push(`| ${code(r.attribute)} | ${cell(r.element)} | ${cell(r.value)} |`);
    out.push('');
  }
  if (a11y.focus) out.push('#### Focus', '', sanitizeMarkdown(a11y.focus), '');
  if (a11y.wcag?.length) {
    out.push('#### WCAG 2.2 success criteria addressed', '', '| Criterion | Level | Note |', '|---|---|---|');
    for (const entry of a11y.wcag) {
      const parsed = parseCriterion(entry);
      const c = parsed && wcagById.get(parsed.id);
      out.push(c ? `| [${c.id} ${c.name}](${c.url}) | ${c.level} | ${cell(parsed.note)} |` : `| ${cell(entry)} | | |`);
    }
    out.push('', 'Automated test results: [Accessibility and compliance](/docs/quality/accessibility/).', '');
  }
  const caveats = [...(a11y.notes ?? []), ...(a11y.knownCaveats ?? [])];
  if (caveats.length) out.push('#### Notes and known caveats', '', ...caveats.map((n) => `- ${sanitizeMarkdown(n)}`), '');
  return out;
}

/**
 * @param {ReturnType<import('./shared.mjs').loadComponent>} c
 * @param {{ live: string[] }} examples Rendered example blocks.
 */
export function componentPage(c, examples) {
  const { sections: s } = sections(c.doc);
  const meta = c.component;
  const styles = headerStyles(c.doc);
  // Page template (R20-4, R20-10 to R20-13): Overview, Live example, Install and start,
  // API reference, Accessibility and performance, then the remaining sections collapsed.
  const out = [
    '---',
    `title: ${yaml(meta.displayName)}`,
    `description: ${yaml(stripSpec(firstSentence(meta.purpose)))}`,
    '---',
    '',
    `<div class="aui-doc-meta aui-cpage"><span>${meta.category}</span><span>Since ${meta.versionIntroduced}</span>${meta.deprecated ? '<span class="deprecated">Deprecated</span>' : ''}</div>`,
    '',
    ...overview(c, s, examples.highlights ?? []),
  ];
  const tabs = [
    ['Showcase', examples.showcase ?? []],
    ['Playground', examples.playground ?? []],
    ['Examples', examples.live],
  ].filter(([, blocks]) => blocks.length);
  if (tabs.length) {
    out.push('## Live example', '', 'Use the bar above each frame to switch theme, density, direction, and locale.', '', '<div class="aui-tabs" data-aui-tabs>', '');
    for (const [label, blocks] of tabs) out.push(`<div class="aui-tabs__panel" data-tab="${label}">`, '', ...blocks, '', '</div>', '');
    out.push('</div>', '');
  }
  out.push(...install(c, s, styles, examples.angular === true));
  out.push(...apiReference(c.api), ...tokenList(c.tokens));
  const ts = section(s, 32);
  if (ts) out.push('<details class="aui-details"><summary>TypeScript definitions</summary>', '', ts, '', '</details>', '');
  out.push(...accessibilityBlock(c.accessibility, examples));
  out.push(...performanceBlock(c, s, examples.size));
  out.push(...details(s));
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Overview: the purpose, key features, when (not) to use, and the anatomy (R20-12). */
function overview(c, s, highlights) {
  const meta = c.component;
  const out = ['## Introduction', '', section(s, 1) || sanitizeMarkdown(meta.purpose), ''];
  if (highlights.length) {
    out.push('<ul class="aui-highlights">');
    for (const h of highlights) out.push(`<li><strong>${escape(h.title)}</strong><span>${escape(h.text)}</span></li>`);
    out.push('</ul>', '');
  }
  out.push(
    '<div class="aui-usecols">',
    '',
    '<div>',
    '',
    '**Use it for**',
    '',
    ...meta.whenToUse.map((w) => `- ${sanitizeMarkdown(w)}`),
    '',
    '</div>',
    '',
    '<div>',
    '',
    '**Use something else for**',
    '',
    ...meta.whenNotToUse.map((w) => `- ${sanitizeMarkdown(w)}`),
    '',
    '</div>',
    '',
    '</div>',
    '',
  );
  const anatomy = section(s, 2);
  if (anatomy) out.push('<details class="aui-details"><summary>Anatomy</summary>', '', anatomy, '', '</details>', '');
  return out;
}

/** Install and start: packages, imports, the smallest working code, and more usage. */
function install(c, s, styles, angular) {
  const meta = c.component;
  const out = [
    '## Install and start',
    '',
    '```sh',
    'npm install @absoluteui/components @absoluteui/core @absoluteui/theme',
    '```',
    '',
    'Registry setup, the theme stylesheet, and the Content Security Policy are covered in [Installation](/docs/getting-started/installation/).',
    '',
    '```ts',
    meta.import,
    ...styles.map((css) => `import '${css}';`),
    '```',
    '',
  ];
  const usage = section(s, 33);
  if (usage) out.push('### First use', '', usage, '');
  const more = section(s, 27).replace(/^More examples, type-checked in CI:.*$/m, '').trim();
  if (more) out.push('<details class="aui-details"><summary>More usage</summary>', '', more, '', '</details>', '');
  // Link to the Angular page (docs/PLAN-R10-DOCS.md R10-5).
  if (angular) out.push(`Using Angular? See [${meta.displayName} for Angular](/docs/angular/components/${c.name}/).`, '');
  return out;
}

/** Performance: declared budgets, tested scale, and the measured import cost (R20-13). */
function performanceBlock(c, s, size) {
  const perf = c.component.performance;
  const out = ['### Performance', ''];
  if (size) out.push('| Import cost | Minified | gzip | brotli | CSS brotli |', '|---|---|---|---|---|', `| ${code(c.component.import.replace(/^import .* from '(.+)';$/, '$1'))} | ${kb(size.js)} | ${kb(size.jsGzip)} | ${kb(size.jsBrotli)} | ${size.cssBrotli ? kb(size.cssBrotli) : ''} |`, '', 'Measured at build time, including every AbsoluteUI module the component pulls in. No third-party runtime dependencies.', '');
  if (perf?.budgets?.length) {
    out.push('| Budget (enforced in CI) | Limit |', '|---|---|');
    for (const b of perf.budgets) out.push(`| ${cell(b.metric)} | ${cell(b.budget)} |`);
    out.push('');
  }
  if (perf?.testedScale) out.push(`**Tested scale:** ${sanitizeMarkdown(perf.testedScale)}`, '');
  const notes = section(s, 25);
  if (notes) out.push(notes, '');
  out.push('Measured run times: [Performance](/docs/quality/performance/).', '');
  return out;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const escape = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Behavior sections kept from the authored doc, in reading order. */
const BEHAVIOR = [
  [11, 'States'],
  [12, 'State transitions'],
  [15, 'Accessibility notes'],
  [16, 'Responsive behavior'],
  [17, 'Right-to-left'],
  [18, 'Theming'],
  [19, 'Global configuration'],
  [20, 'Component configuration'],
  [21, 'Timezones'],
  [22, 'Icons'],
  [23, 'Security'],
  [24, 'Data handling'],
  [25, 'Performance'],
  [26, 'Supported data scale'],
  [28, 'Edge cases'],
  [29, 'Errors'],
  [30, 'Known limitations'],
  [31, 'Unsupported scenarios'],
];

/** Remaining authored sections, collapsed (R20-10). Performance is shown above. */
function details(s) {
  const out = [];
  for (const [n, heading] of BEHAVIOR) {
    if (n === 25) continue;
    const body = section(s, n);
    if (body) out.push(`<details class="aui-details"><summary>${heading}</summary>`, '', body, '', '</details>', '');
  }
  return out.length ? ['## Details', '', ...out] : [];
}

function behavior(s) {
  const out = ['## Behavior', ''];
  for (const [n, heading] of BEHAVIOR) {
    const body = section(s, n);
    if (body) out.push(`### ${heading}`, '', body, '');
  }
  return out;
}

/** Entry points documented without metadata: authored docs plus the API from their .d.ts (data-grid-x is data-grid/x). */
export const ADDONS = ['chart-export', 'org-chart-export', 'data-grid-editors', 'data-grid-accessories', 'data-grid-export', 'data-grid-pdf', 'data-grid-formulas', 'data-grid-charts', 'data-grid-schema'];

/** One-line summaries of the add-ons (their docs have no metadata). */
export const ADDON_SUMMARIES = {
  'chart-export': 'Exports any rendered chart as a standalone SVG document or PNG image, with theme colors and patterns, and nothing uploaded.',
  'org-chart-export': 'Saves the visible part of an Organization Chart as a standalone SVG document or PNG image.',
  'data-grid-editors': 'Combobox and Multi Select cell editors for Data Grid columns.',
  'data-grid-accessories': 'Column and cell menus, column chooser, side bar, status bar, toolbar, tooltips, find, and notes for the Data Grid.',
  'data-grid-export': 'Excel workbooks from a Data Grid, with typed values, styles, outlines, and protection, written in the browser.',
  'data-grid-pdf': 'PDF documents from a Data Grid, with repeated headers, page numbers, and embedded fonts for any script.',
  'data-grid-formulas': 'Calculated columns, cell formulas, and a formula bar for the Data Grid, with a safe parser and evaluator.',
  'data-grid-charts': 'Sparkline columns and charts of selected cells or pivot results for the Data Grid.',
  'data-grid-schema': 'A JSON Schema, a summary, and validated changes of a Data Grid view, for tools such as AI assistants.',
};

/** Pages for docs without metadata (export add-ons): authored sections, API from .d.ts. */
export function addonPage(name, md, apiMarkdown) {
  const { title, sections: s } = sections(md);
  const description = `description: ${yaml(ADDON_SUMMARIES[name] ?? title)}`;
  if (!s.size) {
    // Short docs without numbered sections: intro and every section except the authored API table.
    const [head, ...rest] = md.split(/^## /m);
    const intro = head.replace(/^# .+$/m, '').replace(/^> .+$/m, '').trim();
    const out = ['---', `title: ${yaml(title)}`, description, '---', '', '## What it does', '', sanitizeMarkdown(intro), ''];
    for (const part of rest) {
      const heading = part.slice(0, part.indexOf('\n')).trim();
      if (heading === 'API') continue;
      out.push(`## ${heading}`, '', sanitizeMarkdown(part.slice(part.indexOf('\n') + 1).trim()), '');
    }
    out.push('## API reference', '', apiMarkdown, '');
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  const out = ['---', `title: ${yaml(title)}`, description, '---', '', '## What it does', '', section(s, 1), ''];
  for (const [n, heading] of [[3, 'When to use'], [4, 'When not to use'], [33, 'Usage'], [27, 'More usage']]) {
    const body = section(s, n);
    if (body) out.push(`## ${heading}`, '', body, '');
  }
  out.push('## API reference', '', apiMarkdown, '');
  const ts = section(s, 32);
  if (ts) out.push('### TypeScript definitions', '', ts, '');
  out.push(...behavior(s));
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function writeComponentPage(name, markdown) {
  write(join(contentDir, 'components', `${name}.md`), markdown);
}
