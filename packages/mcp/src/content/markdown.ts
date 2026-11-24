/**
 * Markdown renderings of the content snapshot: component and API references for resources, and the
 * llms.txt index (R15-11). Also used by scripts/build-llms.mjs for the website's llms.txt files, so the
 * server and the site publish the same text.
 */
import type { AngularEntry, ApiModule, ComponentEntry, Content } from './types.js';
import { isJsonArray, isJsonObject, stringOf } from '../protocol/jsonrpc.js';

const cell = (value: unknown): string => {
  const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value);
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
};
const code = (value: unknown): string => {
  const text = typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value);
  return text ? `\`${text.replace(/\|/g, '\\|').replace(/`/g, "'")}\`` : '';
};

export function componentMarkdown(content: Content, c: ComponentEntry): string {
  const out: string[] = [`# ${c.displayName}`, '', c.purpose, '', `- Import: \`${c.import}\``, `- Styles: \`import '${c.styleImport}';\``, `- Docs: ${c.docUrl}`, `- Version: ${content.version}`];
  if (c.angularEntry) out.push(`- Angular: \`@absoluteui/angular/${c.angularEntry}\` (absoluteui://angular/${c.angularEntry})`);
  out.push('');
  if (c.whenToUse.length) out.push('## When to use', '', ...c.whenToUse.map((w) => `- ${w}`), '');
  if (c.whenNotToUse.length) out.push('## When not to use', '', ...c.whenNotToUse.map((w) => `- ${w}`), '');
  if (c.highlights.length) out.push('## Key features', '', ...c.highlights.map((h) => `- **${h.title}**: ${h.text}`), '');
  out.push('## API', '', '```ts', c.api.factory.signature, '```', '');
  if (c.api.options.length) {
    out.push('### Options', '', '| Option | Type | Default | Description |', '|---|---|---|---|');
    for (const o of c.api.options) out.push(`| ${code(o.name)} | ${code(o.type)} | ${o.default === undefined ? '' : code(o.default)} | ${cell(`${o.required ? 'Required. ' : ''}${o.description ?? ''}`)} |`);
    out.push('');
  }
  for (const [title, list] of [['Methods', c.api.methods], ['Properties', c.api.properties], ['Events', c.api.events]] as const) {
    if (!list?.length) continue;
    out.push(`### ${title}`, '', '| Name | Signature or type | Description |', '|---|---|---|');
    for (const m of list) out.push(`| ${code(m.name)} | ${code(m.signature ?? m.type ?? m.detail ?? '')} | ${cell(m.description)} |`);
    out.push('');
  }
  const a11y = c.accessibility;
  if (typeof a11y.pattern === 'string') out.push('## Accessibility', '', a11y.pattern, '');
  if (isJsonArray(a11y.keyboard) && a11y.keyboard.length) {
    out.push('### Keyboard', '', '| Key | Action |', '|---|---|');
    for (const k of a11y.keyboard) {
      if (isJsonObject(k)) out.push(`| ${cell(k.key ?? k.keys)} | ${cell(k.action ?? k.description)} |`);
    }
    out.push('');
  }
  for (const s of c.sections) out.push(`## ${s.heading}`, '', s.body, '');
  if (c.examples.length) {
    out.push('## Examples', '');
    for (const e of c.examples) out.push(`### ${e.title}`, '', `\`\`\`${e.language}`, e.code, '```', '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function apiMarkdown(m: ApiModule): string {
  const out: string[] = [`# ${m.import}`, '', m.preview ? `Preview. ${m.summary}` : m.summary, '', `Docs: ${m.docUrl}`, ''];
  if (m.howTo) out.push('## How to use', '', m.howTo, '');
  out.push('## API reference', '');
  for (const i of m.items) {
    out.push(`### ${i.name}`, '', '```ts', i.signature, '```', '');
    if (i.deprecated) out.push(`Deprecated: ${i.deprecated}`, '');
    if (i.doc) out.push(i.doc, '');
    for (const e of i.examples) out.push('```ts', e, '```', '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function angularMarkdown(e: AngularEntry): string {
  const out: string[] = [`# ${e.title ?? e.import}`, '', e.summary ?? `Angular binding of ${e.component ?? e.entry}.`, '', `- Import: \`${e.import}\``, `- Docs: ${e.docUrl}`, ''];
  for (const ex of e.examples) out.push('## Example', '', `\`\`\`${ex.language}`, ex.code, '```', '');
  for (const d of e.declarations) {
    out.push(`## ${stringOf(d.name)}`, '');
    if (typeof d.description === 'string') out.push(d.description, '');
    if (typeof d.selector === 'string') out.push(`Selector: \`${d.selector}\``, '');
    for (const key of ['inputs', 'models', 'outputs', 'properties', 'methods'] as const) {
      const list = d[key];
      if (!isJsonArray(list) || list.length === 0) continue;
      out.push(`### ${key[0]?.toUpperCase() ?? ''}${key.slice(1)}`, '', '| Name | Type | Description |', '|---|---|---|');
      for (const m of list) {
        if (isJsonObject(m)) out.push(`| ${code(m.name)} | ${code(m.type ?? m.signature ?? m.payload ?? '')} | ${cell(m.description)} |`);
      }
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The llms.txt index (https://llmstxt.org format): what AbsoluteUI is and where each page is. */
export function llmsIndex(content: Content): string {
  const out: string[] = [
    '# AbsoluteUI',
    '',
    `> Framework-neutral Web Components library (TypeScript, ES modules) with an Angular integration, original icon set, theme tokens, and accessibility built in. Version ${content.version}.`,
    '',
    'Import each component from its own entry point and load its style.css. AI assistants can also use the local MCP server @absoluteui/mcp (stdio) for search, references, and code checks.',
    '',
    '## Getting started',
    '',
    ...content.guides.filter((g) => g.slug.startsWith('getting-started/')).map((g) => `- [${g.title}](${g.docUrl}): ${g.description}`),
    '',
    '## Guides',
    '',
    ...content.guides.filter((g) => g.slug.startsWith('guides/')).map((g) => `- [${g.title}](${g.docUrl}): ${g.description}`),
    '',
    '## Components',
    '',
    ...content.components.map((c) => `- [${c.displayName}](${c.docUrl}): ${c.purpose.split(/(?<=[.!?])\s/)[0] ?? ''}`),
    ...content.addons.map((a) => `- [${a.name}](${a.docUrl}): ${a.summary}`),
    '',
    '## Package APIs',
    '',
    ...content.api.map((m) => `- [${m.import}](${m.docUrl}): ${m.preview ? 'Preview. ' : ''}${m.summary}`),
    '',
    '## Angular',
    '',
    ...content.guides.filter((g) => g.slug.startsWith('angular')).map((g) => `- [${g.title}](${g.docUrl}): ${g.description}`),
    ...content.angular.filter((e) => e.component === null).map((e) => `- [${e.import}](${e.docUrl}): ${e.summary ?? ''}`),
    '',
  ];
  return out.join('\n');
}

/** The llms-full.txt text: every guide, component, and API page in one Markdown document. */
export function llmsFull(content: Content): string {
  const parts: string[] = [llmsIndex(content)];
  for (const g of content.guides) parts.push(`# ${g.title}\n\nSource: ${g.docUrl}\n\n${g.markdown}`);
  for (const c of content.components) parts.push(componentMarkdown(content, c));
  for (const a of content.addons) parts.push(`# ${a.name}\n\nImport: \`${a.import}\`\nSource: ${a.docUrl}\n\n${a.markdown}`);
  for (const m of content.api) parts.push(apiMarkdown(m));
  for (const e of content.angular) parts.push(angularMarkdown(e));
  return `${parts.join('\n\n---\n\n')}\n`;
}
