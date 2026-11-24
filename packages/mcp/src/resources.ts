/**
 * absoluteui:// resources (docs/PLAN-R15-MCP.md section 4.3). URIs are matched against the known
 * content only (allow list); nothing is ever read from a path a client names.
 */
import type { ResourceContents, ResourceEntry, ResourceProvider, ResourceTemplateEntry } from './surface.js';
import type { Content } from './content/types.js';
import { angularMarkdown, apiMarkdown, componentMarkdown, llmsIndex } from './content/markdown.js';

const METADATA_FILES = ['component', 'api', 'accessibility', 'tokens', 'examples'] as const;
const JSON_TYPE = 'application/json';
const MD_TYPE = 'text/markdown';

export const TEMPLATES: readonly ResourceTemplateEntry[] = [
  { uriTemplate: 'absoluteui://component/{name}', name: 'component', title: 'Component reference', description: 'Full reference of one component (Markdown).', mimeType: MD_TYPE },
  { uriTemplate: 'absoluteui://component/{name}/metadata/{file}', name: 'component-metadata', title: 'Component metadata', description: 'Machine-readable metadata of one component: component, api, accessibility, tokens, or examples (JSON).', mimeType: JSON_TYPE },
  { uriTemplate: 'absoluteui://api/{package}/{module}', name: 'api', title: 'Package API', description: 'API reference of a package module (Markdown); use "index" for a package root.', mimeType: MD_TYPE },
  { uriTemplate: 'absoluteui://angular/{entry}', name: 'angular', title: 'Angular entry point', description: 'Reference of an @absoluteui/angular entry point (Markdown).', mimeType: MD_TYPE },
  { uriTemplate: 'absoluteui://guide/{+slug}', name: 'guide', title: 'Guide', description: 'A getting-started page, guide, or Angular guide (Markdown).', mimeType: MD_TYPE },
];

export function createResources(content: Content): ResourceProvider {
  const components = new Map(content.components.map((c) => [c.name, c]));
  const addons = new Map(content.addons.map((a) => [a.name, a]));
  const apiKey = (pkg: string, module: string | null): string => `${pkg}/${module ?? 'index'}`;
  const apis = new Map(content.api.map((m) => [apiKey(m.package, m.module), m]));
  const angular = new Map(content.angular.map((e) => [e.entry, e]));
  const guides = new Map(content.guides.map((g) => [g.slug, g]));
  const json = (uri: string, value: unknown): ResourceContents[] => [{ uri, mimeType: JSON_TYPE, text: JSON.stringify(value, null, 1) }];
  const md = (uri: string, text: string): ResourceContents[] => [{ uri, mimeType: MD_TYPE, text }];

  const fixed: readonly ResourceEntry[] = [
    { uri: 'absoluteui://components', name: 'components', title: 'Component index', description: 'Every component with its group, purpose, and imports.', mimeType: JSON_TYPE },
    { uri: 'absoluteui://tokens', name: 'tokens', title: 'Design tokens', description: 'Global tokens per built-in theme, densities, and component tokens.', mimeType: JSON_TYPE },
    { uri: 'absoluteui://icons', name: 'icons', title: 'Icon catalog', description: 'The original AbsoluteUI icon set: names, categories, aliases, and imports.', mimeType: JSON_TYPE },
    { uri: 'absoluteui://schema/dashboard', name: 'dashboard-schema', title: 'Dashboard definition schema', description: 'JSON Schema 2020-12 of a dashboard definition.', mimeType: JSON_TYPE },
    { uri: 'absoluteui://llms.txt', name: 'llms', title: 'llms.txt', description: 'The documentation index the website publishes for AI assistants.', mimeType: 'text/plain' },
  ];
  const listed: readonly ResourceEntry[] = [
    ...fixed,
    ...content.guides.map((g) => ({ uri: `absoluteui://guide/${g.slug}`, name: `guide-${g.slug.replace(/\//g, '-')}`, title: g.title, description: g.description, mimeType: MD_TYPE })),
    ...content.components.map((c) => ({ uri: `absoluteui://component/${c.name}`, name: `component-${c.name}`, title: c.displayName, mimeType: MD_TYPE })),
  ];

  const read = (uri: string): readonly ResourceContents[] | undefined => {
    switch (uri) {
      case 'absoluteui://components':
        return json(uri, content.components.map((c) => ({ name: c.name, displayName: c.displayName, group: c.group, purpose: c.purpose, import: c.import, styleImport: c.styleImport, docUrl: c.docUrl })));
      case 'absoluteui://tokens':
        return json(uri, content.tokens);
      case 'absoluteui://icons':
        return json(uri, content.icons);
      case 'absoluteui://schema/dashboard':
        return json(uri, content.schemas.dashboard);
      case 'absoluteui://llms.txt':
        return [{ uri, mimeType: 'text/plain', text: llmsIndex(content) }];
      default:
        break;
    }
    const metadata = /^absoluteui:\/\/component\/([a-z0-9-]+)\/metadata\/([a-z]+)$/.exec(uri);
    if (metadata) {
      const c = components.get(metadata[1] ?? '');
      const file = metadata[2] ?? '';
      if (!c || !(METADATA_FILES as readonly string[]).includes(file)) return undefined;
      const base = { name: c.name };
      if (file === 'component') return json(uri, { ...base, displayName: c.displayName, category: c.category, purpose: c.purpose, whenToUse: c.whenToUse, whenNotToUse: c.whenNotToUse, import: c.import, styleImport: c.styleImport, ...c.component });
      if (file === 'api') return json(uri, { component: c.name, ...c.api });
      if (file === 'accessibility') return json(uri, { component: c.name, ...c.accessibility });
      if (file === 'tokens') return json(uri, { component: c.name, tokens: c.tokens });
      return json(uri, { component: c.name, examples: c.examples });
    }
    const component = /^absoluteui:\/\/component\/([a-z0-9-]+)$/.exec(uri);
    if (component) {
      const name = component[1] ?? '';
      const c = components.get(name);
      if (c) return md(uri, componentMarkdown(content, c));
      const a = addons.get(name);
      return a ? md(uri, `# ${a.name}\n\nImport: \`${a.import}\`\nDocs: ${a.docUrl}\n\n${a.markdown}`) : undefined;
    }
    const api = /^absoluteui:\/\/api\/([a-z]+)\/([a-z0-9-]+)$/.exec(uri);
    if (api) {
      const m = apis.get(`${api[1] ?? ''}/${api[2] ?? ''}`);
      return m ? md(uri, apiMarkdown(m)) : undefined;
    }
    const ng = /^absoluteui:\/\/angular\/([a-z0-9-]+)$/.exec(uri);
    if (ng) {
      const e = angular.get(ng[1] ?? '');
      return e ? md(uri, angularMarkdown(e)) : undefined;
    }
    const guide = /^absoluteui:\/\/guide\/([a-z0-9/-]+)$/.exec(uri);
    if (guide) {
      const g = guides.get(guide[1] ?? '');
      return g ? md(uri, `# ${g.title}\n\nDocs: ${g.docUrl}\n\n${g.markdown}`) : undefined;
    }
    return undefined;
  };

  const complete = (uriTemplate: string, variable: string, value: string): readonly string[] => {
    const prefix = value.toLowerCase();
    let names: readonly string[] = [];
    if (variable === 'name') names = [...components.keys(), ...addons.keys()];
    else if (variable === 'file') names = METADATA_FILES;
    else if (variable === 'package') names = [...new Set(content.api.map((m) => m.package))];
    else if (variable === 'module') names = [...new Set(content.api.map((m) => m.module ?? 'index'))];
    else if (variable === 'entry') names = [...angular.keys()];
    else if (variable === 'slug') names = [...guides.keys()];
    if (!TEMPLATES.some((t) => t.uriTemplate === uriTemplate)) return [];
    return names.filter((n) => n.startsWith(prefix)).sort();
  };

  return { list: () => listed, templates: () => TEMPLATES, read, complete };
}
