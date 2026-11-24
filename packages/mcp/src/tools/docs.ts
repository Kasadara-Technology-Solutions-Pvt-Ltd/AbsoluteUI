/**
 * Documentation tools (docs/PLAN-R15-MCP.md section 4.2): search, components, examples, APIs, Angular,
 * guides, tokens, icons, and setup. Every answer comes from the content snapshot of this version.
 */
import { stringOf, type JsonObject, type JsonValue } from '../protocol/jsonrpc.js';
import type { ToolDefinition } from '../surface.js';
import { ToolInputError } from '../surface.js';
import type { AngularEntry, ApiModule, ComponentEntry, Content, GuideEntry } from '../content/types.js';
import { SEARCH_KINDS, type SearchIndex, type SearchKind } from '../content/search.js';
import { RESULT_BUDGET, firstSentence, fit, markdownSections, optionalString, requiredString, size, stringList, toJson, unknown } from './util.js';

const NAME = { type: 'string', minLength: 1, maxLength: 128 } as const;
const OBJECT_OUT = (required: readonly string[]): JsonObject => ({ type: 'object', required: [...required] });

export const COMPONENT_SECTIONS = ['overview', 'highlights', 'options', 'methods', 'events', 'properties', 'keyboard', 'accessibility', 'behavior', 'performance', 'tokens', 'css', 'security', 'limitations', 'usage', 'typescript'] as const;
type ComponentSection = (typeof COMPONENT_SECTIONS)[number];
const DEFAULT_SECTIONS: readonly ComponentSection[] = ['overview', 'options', 'events'];
export const API_PACKAGES = ['core', 'utilities', 'helpers', 'theme', 'icons', 'services'] as const;

function sectionText(c: ComponentEntry, n: number): string | undefined {
  return c.sections.find((s) => s.number === n)?.body;
}

function headed(c: ComponentEntry, numbers: readonly number[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of numbers) {
    const s = c.sections.find((x) => x.number === n);
    if (s) out[s.heading] = s.body;
  }
  return out;
}

function componentSection(content: Content, c: ComponentEntry, key: ComponentSection): JsonValue {
  const meta = c.component;
  const a11y = c.accessibility;
  switch (key) {
    case 'overview':
      return toJson({
        displayName: c.displayName,
        purpose: c.purpose,
        group: c.group,
        category: c.category,
        import: c.import,
        styleImport: c.styleImport,
        whenToUse: c.whenToUse,
        whenNotToUse: c.whenNotToUse,
        introduction: sectionText(c, 1),
        anatomy: sectionText(c, 2),
        angular: c.angularEntry ? `@absoluteui/angular/${c.angularEntry}` : null,
        showcases: c.showcases,
      });
    case 'highlights':
      return toJson(c.highlights);
    case 'options':
      return toJson({ factory: c.api.factory, configKey: c.api.configKey ?? null, options: c.api.options });
    case 'methods':
      return toJson(c.api.methods ?? []);
    case 'events':
      return toJson(c.api.events ?? []);
    case 'properties':
      return toJson(c.api.properties ?? []);
    case 'keyboard':
      return toJson({ keyboard: a11y.keyboard ?? [], focus: a11y.focus ?? null });
    case 'accessibility':
      return toJson({ pattern: a11y.pattern, roles: a11y.roles, aria: a11y.aria, wcag: a11y.wcag, notes: a11y.notes, knownCaveats: a11y.knownCaveats, ...headed(c, [15]) });
    case 'behavior':
      return toJson({ states: meta.states, responsive: meta.responsive, rtl: meta.rtl, theme: meta.theme, timezone: meta.timezone, ...headed(c, [12, 16, 17, 18, 19, 20, 21, 22, 28, 29]) });
    case 'performance':
      return toJson({ performance: meta.performance, importCost: c.importCost, ...headed(c, [25, 26]) });
    case 'tokens':
      return toJson({ globalTokens: c.tokens, componentTokens: content.tokens.components.find((g) => g.component === c.name)?.tokens ?? [], themingGuide: `${content.docsUrl}/guides/theming/` });
    case 'css':
      return toJson({ cssClasses: c.api.cssClasses ?? [], contentAreas: c.api.contentAreas ?? [], iconSlots: c.api.iconSlots ?? [] });
    case 'security':
      return toJson({ security: meta.security, dataHandling: meta.dataHandling, ...headed(c, [23, 24]) });
    case 'limitations':
      return toJson({ limitations: meta.limitations, unsupported: meta.unsupported, antiPatterns: meta.antiPatterns, ...headed(c, [30, 31]) });
    case 'usage':
      return toJson(headed(c, [33, 27]));
    case 'typescript':
      return toJson(sectionText(c, 32) ?? '');
  }
}

export function docTools(content: Content, index: SearchIndex): ToolDefinition[] {
  const components = new Map(content.components.map((c) => [c.name, c]));
  const addons = new Map(content.addons.map((a) => [a.name, a]));
  const componentNames = [...components.keys(), ...addons.keys()];
  const excluded = new Set(content.excluded);
  const tooLarge = (docUrl: string) => (key: string): JsonValue => ({ truncated: true, message: `The "${key}" part is too large for one answer; read it at ${docUrl}.`, docUrl });

  const findComponent = (input: string): ComponentEntry | undefined => components.get(input.toLowerCase().replace(/^aui-/, '').replace(/\s+/g, '-'));
  const notAvailable = (name: string): never => {
    const lower = name.toLowerCase();
    if (excluded.has(lower)) throw new ToolInputError(`'${lower}' is not part of AbsoluteUI (removed or on hold). Search for an alternative with search_docs.`);
    return unknown('component', name, componentNames);
  };

  const searchDocs: ToolDefinition = {
    name: 'search_docs',
    title: 'Search the AbsoluteUI docs',
    description: 'Ranked search over AbsoluteUI components, package APIs, Angular bindings, guides, design tokens, and icons of this version. Returns ids and resource URIs for the get_* tools.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200, description: 'Words to search for, such as "date range with business days".' },
        kinds: { type: 'array', items: { enum: [...SEARCH_KINDS] }, uniqueItems: true, maxItems: SEARCH_KINDS.length, description: 'Restrict to these kinds.' },
        limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Maximum hits (default 10).' },
      },
    },
    outputSchema: { type: 'object', required: ['query', 'hits'], properties: { query: { type: 'string' }, hits: { type: 'array', items: { type: 'object', required: ['kind', 'id', 'title', 'uri'] } } } },
    run: (args) => {
      const query = requiredString(args, 'query');
      const kinds = stringList(args, 'kinds')?.filter((k): k is SearchKind => (SEARCH_KINDS as readonly string[]).includes(k));
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const hits = index.search(query, { ...(kinds ? { kinds } : {}), limit });
      return { query, hits: toJson(hits) };
    },
  };

  const groups = [...new Set(content.components.map((c) => c.group))];
  const listComponents: ToolDefinition = {
    name: 'list_components',
    title: 'List AbsoluteUI components',
    description: 'Without a group: every component name by group. With a group (such as "Forms" or "Charts"): each component of the group with its purpose, when to use it, and its imports.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { group: { type: 'string', minLength: 1, maxLength: 64, description: `One of: ${groups.join(', ')}.` } } },
    outputSchema: OBJECT_OUT(['version']),
    run: (args) => {
      const group = optionalString(args, 'group');
      if (group === undefined) {
        return {
          version: content.version,
          groups: groups.map((g) => ({ group: g, components: content.components.filter((c) => c.group === g).map((c) => ({ name: c.name, displayName: c.displayName })) })),
          addons: content.addons.map((a) => ({ name: a.name, summary: a.summary })),
        };
      }
      const match = groups.find((g) => g.toLowerCase() === group.toLowerCase());
      if (!match) return unknown('group', group, groups);
      return {
        version: content.version,
        group: match,
        components: content.components
          .filter((c) => c.group === match)
          .map((c) => ({ name: c.name, displayName: c.displayName, purpose: firstSentence(c.purpose), whenToUse: c.whenToUse[0] ?? '', import: c.import, styleImport: c.styleImport, docUrl: c.docUrl })),
      };
    },
  };

  const getComponent: ToolDefinition = {
    name: 'get_component',
    title: 'Get a component reference',
    description: 'The reference of one component: overview, options, methods, events, properties, keyboard, accessibility, behavior, performance, tokens, CSS hooks, security, limitations, usage, and TypeScript definitions. Defaults to overview, options, and events. Parts that do not fit one answer are listed in "omitted"; ask for them by name.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { ...NAME, description: 'Component name, such as "date-picker" (add-on entry points such as "data-grid-export" also work).' },
        sections: { type: 'array', items: { enum: [...COMPONENT_SECTIONS] }, uniqueItems: true, minItems: 1, maxItems: COMPONENT_SECTIONS.length },
      },
    },
    outputSchema: OBJECT_OUT(['name', 'docUrl']),
    run: (args) => {
      const name = requiredString(args, 'name');
      const c = findComponent(name);
      if (!c) {
        const addon = addons.get(name.toLowerCase());
        if (!addon) return notAvailable(name);
        const parts = markdownSections(addon.markdown).map(([heading, text]): [string, JsonValue] => [heading, text]);
        const api: [string, JsonValue] = ['API', toJson(addon.api.map((i) => ({ name: i.name, kind: i.kind, signature: i.signature, doc: firstSentence(i.doc) })))];
        const { included, omitted } = fit([...parts, api], RESULT_BUDGET - 600, tooLarge(addon.docUrl));
        return { name: addon.name, import: addon.import, summary: addon.summary, docUrl: addon.docUrl, sections: included, omitted };
      }
      const wanted = (stringList(args, 'sections') ?? DEFAULT_SECTIONS) as readonly ComponentSection[];
      const { included, omitted } = fit(wanted.map((key): [string, JsonValue] => [key, componentSection(content, c, key)]), RESULT_BUDGET - 600, tooLarge(c.docUrl));
      return { name: c.name, displayName: c.displayName, docUrl: c.docUrl, version: content.version, sections: included, omitted, available: [...COMPONENT_SECTIONS] };
    },
  };

  const getExamples: ToolDefinition = {
    name: 'get_examples',
    title: 'Get component examples',
    description: 'Type-checked examples of a component (TypeScript by default, or Angular), or the source of its fully featured showcase. Examples that do not fit are listed in "omitted"; ask for them with "ids".',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: NAME,
        framework: { enum: ['ts', 'angular'] },
        kind: { enum: ['examples', 'showcase'] },
        ids: { type: 'array', items: { type: 'string', maxLength: 128 }, uniqueItems: true, minItems: 1, maxItems: 50 },
      },
    },
    outputSchema: OBJECT_OUT(['name', 'examples']),
    run: (args) => {
      const name = requiredString(args, 'name');
      const c = findComponent(name);
      if (!c) return notAvailable(name);
      const kind = optionalString(args, 'kind') ?? 'examples';
      const framework = optionalString(args, 'framework') ?? 'ts';
      const ids = stringList(args, 'ids');
      let parts: [string, JsonValue][];
      if (kind === 'showcase') {
        parts = content.showcases.filter((s) => s.components.includes(c.name)).map((s) => [s.id, toJson({ title: s.title, components: s.components, language: 'ts', code: s.code })]);
      } else if (framework === 'angular') {
        const entry = content.angular.find((e) => e.entry === c.angularEntry);
        parts = (entry?.examples ?? []).map((e, i) => [`angular-${String(i + 1)}`, toJson({ language: e.language, code: e.code, import: entry?.import })]);
      } else {
        parts = c.examples.map((e) => [e.id, toJson({ title: e.title, language: e.language, code: e.code })]);
      }
      if (ids) {
        const known = parts.map(([id]) => id);
        for (const id of ids) if (!known.includes(id)) unknown('example id', id, known);
        parts = parts.filter(([id]) => ids.includes(id));
      }
      const { included, omitted } = fit(parts, RESULT_BUDGET - 800, tooLarge(c.docUrl));
      return { name: c.name, kind, framework: kind === 'showcase' ? 'ts' : framework, styleImport: c.styleImport, examples: included, omitted, docUrl: c.docUrl };
    },
  };

  const apiSummary = (m: ApiModule): JsonValue => toJson({ import: m.import, summary: m.summary, preview: m.preview, docUrl: m.docUrl });
  const getApi: ToolDefinition = {
    name: 'get_api',
    title: 'Get a package API',
    description: 'The API of an AbsoluteUI package (core, utilities, helpers, theme, icons, services): its modules, the exports of a module, or one symbol with its signature, documentation, and examples. @absoluteui/services is in preview.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['package'],
      properties: {
        package: { enum: [...API_PACKAGES] },
        module: { type: 'string', minLength: 1, maxLength: 64, description: 'Subpath module, such as "date" for @absoluteui/helpers/date, or "designer" for @absoluteui/theme/designer.' },
        symbol: { type: 'string', minLength: 1, maxLength: 128, description: 'Exported name, such as "addBusinessDays".' },
      },
    },
    outputSchema: OBJECT_OUT(['package']),
    run: (args) => {
      const pkg = requiredString(args, 'package');
      const moduleName = optionalString(args, 'module');
      const symbol = optionalString(args, 'symbol');
      const all = content.api.filter((m) => m.package === pkg);
      const hasModules = all.some((m) => m.module !== null && all.every((x) => x.module !== null));
      let candidates: readonly ApiModule[];
      if (moduleName !== undefined) {
        const found = all.find((m) => m.module === moduleName);
        if (!found) return unknown(`module of @absoluteui/${pkg}`, moduleName, all.map((m) => m.module ?? 'index'));
        candidates = [found];
      } else if (hasModules && symbol === undefined) {
        return { package: pkg, preview: all.some((m) => m.preview), modules: all.map((m) => ({ module: m.module, ...(apiSummary(m) as JsonObject) })) };
      } else candidates = hasModules ? all : all.filter((m) => m.module === null);
      if (symbol !== undefined) {
        for (const m of candidates) {
          const item = m.items.find((i) => i.name === symbol);
          if (item) return { package: pkg, module: m.module, import: m.import, preview: m.preview, symbol: toJson(item), docUrl: m.docUrl };
        }
        return unknown(`symbol of @absoluteui/${pkg}${moduleName ? `/${moduleName}` : ''}`, symbol, candidates.flatMap((m) => m.items.map((i) => i.name)));
      }
      const m = candidates[0];
      if (!m) return unknown('package', pkg, [...API_PACKAGES]);
      const items = m.items.map((i) => ({ name: i.name, kind: i.kind, group: i.module, summary: firstSentence(i.doc), deprecated: i.deprecated !== null }));
      const howTo = m.howTo.length + size(toJson(items)) < RESULT_BUDGET - 1000 ? m.howTo : `${m.howTo.slice(0, Math.max(0, RESULT_BUDGET - 1000 - size(toJson(items))))}\n\n[Truncated: see ${m.docUrl}]`;
      return { package: pkg, module: m.module, ...(apiSummary(m) as JsonObject), howTo, exports: items };
    },
  };

  const angularNames = content.angular.map((e) => e.entry);
  const findAngular = (input: string): AngularEntry | undefined => {
    const v = input.trim();
    const bare = v.replace(/^@absoluteui\/angular\/?/, '').replace(/^aui-/, '');
    return (
      content.angular.find((e) => e.entry === (bare === '' ? 'index' : bare)) ??
      content.angular.find((e) => e.declarations.some((d) => d.name === v || d.selector === v))
    );
  };
  const getAngular: ToolDefinition = {
    name: 'get_angular',
    title: 'Get an Angular binding',
    description: 'An @absoluteui/angular entry point: selector, inputs, models, outputs, forms integration, templates, and its Angular example. Accepts the entry ("select"), the selector ("aui-select"), or the class ("AuiSelect").',
    inputSchema: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: NAME, declaration: { type: 'string', minLength: 1, maxLength: 128, description: 'Only this declaration (class name) of the entry.' } } },
    outputSchema: OBJECT_OUT(['entry', 'import']),
    run: (args) => {
      const name = requiredString(args, 'name');
      const e = findAngular(name);
      if (!e) {
        if (excluded.has(name.toLowerCase())) return notAvailable(name);
        return unknown('Angular entry point', name, angularNames);
      }
      const only = optionalString(args, 'declaration');
      const declarations = e.declarations.filter((d) => only === undefined || d.name === only);
      if (only !== undefined && declarations.length === 0) return unknown(`declaration of ${e.import}`, only, e.declarations.map((d) => stringOf(d.name)));
      const parts: [string, JsonValue][] = [['examples', toJson(e.examples)], ...declarations.map((d): [string, JsonValue] => [stringOf(d.name), d])];
      const { included, omitted } = fit(parts, RESULT_BUDGET - 600, tooLarge(e.docUrl));
      return { entry: e.entry, import: e.import, component: e.component, title: e.title, summary: e.summary, docUrl: e.docUrl, parts: included, omitted };
    },
  };

  const guideSlugs = content.guides.map((g) => g.slug);
  const findGuide = (input: string): GuideEntry | undefined => {
    const v = input.trim().replace(/^\/+|\/+$/g, '').replace(/^docs\//, '').toLowerCase();
    return content.guides.find((g) => g.slug === v) ?? content.guides.find((g) => g.slug.endsWith(`/${v}`)) ?? content.guides.find((g) => g.title.toLowerCase() === v);
  };
  const getGuide: ToolDefinition = {
    name: 'get_guide',
    title: 'Get a guide',
    description: `A getting-started page, guide, or Angular guide as Markdown. Long guides return their outline and first sections; ask for one "section" by its heading. Slugs: ${guideSlugs.join(', ')}.`,
    inputSchema: { type: 'object', additionalProperties: false, required: ['slug'], properties: { slug: NAME, section: { type: 'string', minLength: 1, maxLength: 200 } } },
    outputSchema: OBJECT_OUT(['slug', 'title', 'docUrl']),
    run: (args) => {
      const slug = requiredString(args, 'slug');
      const g = findGuide(slug);
      if (!g) return unknown('guide', slug, guideSlugs);
      const parts = markdownSections(g.markdown);
      const outline = parts.map(([h]) => h);
      const section = optionalString(args, 'section');
      if (section !== undefined) {
        const part = parts.find(([h]) => h.toLowerCase() === section.toLowerCase());
        if (!part) return unknown(`section of ${g.slug}`, section, outline);
        const fitted = fit([[part[0], part[1]]], RESULT_BUDGET - 600, tooLarge(g.docUrl));
        return { slug: g.slug, title: g.title, docUrl: g.docUrl, outline, sections: fitted.included };
      }
      const { included, omitted } = fit(parts.map(([h, t]): [string, JsonValue] => [h, t]), RESULT_BUDGET - 1200, tooLarge(g.docUrl));
      return { slug: g.slug, title: g.title, description: g.description, docUrl: g.docUrl, outline, sections: included, omitted };
    },
  };

  const tokenGroups = (): string[] => {
    const names = Object.keys(content.tokens.themes[0]?.tokens ?? {});
    return [...new Set(names.map((n) => n.split('-')[0] ?? n))].sort();
  };
  const valuesOf = (name: string): JsonObject => Object.fromEntries(content.tokens.themes.map((t) => [t.name, t.tokens[name] ?? null]));
  const getTokens: ToolDefinition = {
    name: 'get_tokens',
    title: 'Get design tokens',
    description: 'Design tokens: the component tokens of one component (CSS custom properties with their fallbacks) and the global tokens it reads, with values per built-in theme; or the global tokens of one group (such as "color" or "space"); or, without arguments, the groups and components that have tokens.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { component: NAME, group: { type: 'string', minLength: 1, maxLength: 64 } } },
    outputSchema: OBJECT_OUT(['themes']),
    run: (args) => {
      const component = optionalString(args, 'component');
      const group = optionalString(args, 'group');
      const themes = content.tokens.themes.map((t) => ({ name: t.name, mode: t.mode }));
      if (component !== undefined) {
        const key = component.toLowerCase();
        const own = content.tokens.components.find((g) => g.component === key);
        const c = components.get(key);
        if (!own && !c) return unknown('component with tokens', component, [...new Set([...content.tokens.components.map((g) => g.component), ...components.keys()])]);
        const globals = (c?.tokens ?? []).map((n) => ({ name: n, cssProperty: `--aui-${n}`, values: valuesOf(n) }));
        const parts: [string, JsonValue][] = [['componentTokens', toJson(own?.tokens ?? [])], ['globalTokens', toJson(globals)]];
        const { included, omitted } = fit(parts, RESULT_BUDGET - 600, () => ({ truncated: true, docUrl: `${content.docsUrl}/guides/theming/` }));
        return { themes: toJson(themes), component: key, ...included, omitted };
      }
      if (group !== undefined) {
        const known = tokenGroups();
        if (!known.includes(group.toLowerCase())) return unknown('token group', group, known);
        const names = Object.keys(content.tokens.themes[0]?.tokens ?? {}).filter((n) => n === group.toLowerCase() || n.startsWith(`${group.toLowerCase()}-`));
        return { themes: toJson(themes), group: group.toLowerCase(), tokens: names.map((n) => ({ name: n, cssProperty: `--aui-${n}`, values: valuesOf(n) })), densities: toJson(Object.fromEntries(Object.entries(content.tokens.densities).map(([d, map]) => [d, Object.fromEntries(Object.entries(map).filter(([n]) => names.includes(n)))]))) };
      }
      return { themes: toJson(themes), groups: tokenGroups(), componentsWithTokens: content.tokens.components.map((g) => g.component), docUrl: `${content.docsUrl}/guides/theming/` };
    },
  };

  const iconCategories = [...new Set(content.icons.icons.map((i) => i.category))];
  const searchIcons: ToolDefinition = {
    name: 'search_icons',
    title: 'Search the AbsoluteUI icon set',
    description: 'Find icons in the original AbsoluteUI icon set by meaning, name, or alias, with the import for each. Prefer these over third-party icons, which work only through an icon adapter.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: { query: { type: 'string', minLength: 1, maxLength: 200 }, category: { enum: iconCategories }, limit: { type: 'integer', minimum: 1, maximum: 50 } },
    },
    outputSchema: OBJECT_OUT(['icons']),
    run: (args) => {
      const query = requiredString(args, 'query');
      const category = optionalString(args, 'category');
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const exact = content.icons.icons.find((i) => i.id === query.trim().toLowerCase() || i.aliases.includes(query.trim().toLowerCase()));
      const ranked = index.search(query, { kinds: ['icon'], limit: 200 }).map((h) => h.id);
      const ids = [...new Set([...(exact ? [exact.id] : []), ...ranked])];
      const icons = ids
        .map((id) => content.icons.icons.find((i) => i.id === id))
        .filter((i): i is NonNullable<typeof i> => i !== undefined && (category === undefined || i.category === category))
        .slice(0, limit);
      return {
        icons: toJson(icons.map((i) => ({ id: i.id, displayName: i.displayName, category: i.category, description: i.description, aliases: i.aliases, variants: i.variants, rtl: i.rtl, exportName: i.exportName, import: i.import }))),
        usage: "Pass the definition to renderIcon (import { renderIcon } from '@absoluteui/icons') or to a component's icons option. To use icons by name, import '@absoluteui/icons/set/register' once at start-up (it bundles the whole set).",
        docUrl: `${content.docsUrl}/guides/icons/`,
      };
    },
  };

  const getSetup: ToolDefinition = {
    name: 'get_setup',
    title: 'Get installation and setup',
    description: 'How to install and set up AbsoluteUI of this version: packages, styles, theme runtime, configuration, and (for Angular) providers.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { framework: { enum: ['ts', 'angular'] } } },
    outputSchema: OBJECT_OUT(['version', 'framework', 'guides']),
    run: (args) => {
      const framework = optionalString(args, 'framework') ?? 'ts';
      const slugs = framework === 'angular' ? ['angular/guides/getting-started', 'getting-started/installation'] : ['getting-started/installation', 'getting-started/configuration'];
      const parts = slugs.map((s): [string, JsonValue] => {
        const g = content.guides.find((x) => x.slug === s);
        return [s, g ? toJson({ title: g.title, docUrl: g.docUrl, markdown: g.markdown }) : null];
      });
      const { included, omitted } = fit(parts, RESULT_BUDGET - 600, (key) => ({ truncated: true, docUrl: `${content.docsUrl}/${key}/` }));
      return { version: content.version, framework, versionNote: `Install the same version (${content.version}) of every @absoluteui/* package as this server.`, guides: included, omitted };
    },
  };

  return [searchDocs, listComponents, getComponent, getExamples, getApi, getAngular, getGuide, getTokens, searchIcons, getSetup];
}
