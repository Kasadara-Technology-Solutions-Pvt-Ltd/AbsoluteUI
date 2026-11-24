// Every documentation tool against the real content: every component, section, Angular entry, API
// module, guide, and token group answers within the size limit.
import { describe, expect, it } from 'vitest';
import { client, content } from './support.js';
import { COMPONENT_SECTIONS } from '../src/tools/docs.js';
import { stringOf, type JsonObject } from '../src/protocol/jsonrpc.js';

const LIMIT = 25_000;

describe('documentation tools', () => {
  const c = client();
  const snapshot = content();

  it('lists the thirteen tools in order with annotations', async () => {
    const message = await c.request('tools/list');
    const tools = message && 'result' in message ? (message.result.tools as readonly JsonObject[]) : [];
    expect(tools.map((t) => t.name)).toEqual(['search_docs', 'list_components', 'get_component', 'get_examples', 'get_api', 'get_angular', 'get_guide', 'get_tokens', 'search_icons', 'get_setup', 'validate_usage', 'get_schema', 'validate_dashboard']);
  });

  it('answers every section of every component within the limit', async () => {
    for (const component of snapshot.components) {
      for (const section of COMPONENT_SECTIONS) {
        const r = await c.call('get_component', { name: component.name, sections: [section] });
        expect(r.isError, `${component.name} ${section}: ${r.text.slice(0, 200)}`).toBe(false);
        expect(r.text.length).toBeLessThan(LIMIT);
      }
      const all = await c.call('get_component', { name: component.name, sections: [...COMPONENT_SECTIONS] });
      expect(all.isError, component.name).toBe(false);
    }
  });

  it('answers add-on entry points and suggests names', async () => {
    for (const addon of snapshot.addons) expect((await c.call('get_component', { name: addon.name })).isError, addon.name).toBe(false);
    const wrong = await c.call('get_component', { name: 'datagrid' });
    expect(wrong.isError).toBe(true);
    expect(wrong.text).toContain("'data-grid'");
    const removed = await c.call('get_component', { name: 'sankey-chart' });
    expect(removed.text).toMatch(/not part of AbsoluteUI/);
  });

  it('returns examples, Angular examples, and showcases', async () => {
    for (const component of snapshot.components) {
      for (const args of [{}, { framework: 'angular' }, { kind: 'showcase' }]) {
        const r = await c.call('get_examples', { name: component.name, ...args });
        expect(r.isError, `${component.name} ${JSON.stringify(args)}: ${r.text.slice(0, 200)}`).toBe(false);
      }
    }
    const select = await c.call('get_examples', { name: 'select', ids: ['basic'] });
    expect(Object.keys(select.data.examples as JsonObject)).toEqual(['basic']);
    expect(Object.keys((await c.call('get_examples', { name: 'select', kind: 'showcase' })).data.examples as JsonObject)).toContain('forms');
  });

  it('answers every Angular entry by entry, selector, and class', async () => {
    for (const entry of snapshot.angular) {
      const r = await c.call('get_angular', { name: entry.entry });
      expect(r.isError, `${entry.entry}: ${r.text.slice(0, 200)}`).toBe(false);
      expect(r.text.length).toBeLessThan(LIMIT);
    }
    expect((await c.call('get_angular', { name: 'aui-select' })).data.entry).toBe('select');
    expect((await c.call('get_angular', { name: 'AuiSelect' })).data.entry).toBe('select');
  });

  it('answers every API module and symbol', async () => {
    for (const m of snapshot.api) {
      const r = await c.call('get_api', { package: m.package, ...(m.module === null ? {} : { module: m.module }) });
      expect(r.isError, `${m.import}: ${r.text.slice(0, 200)}`).toBe(false);
      expect(r.text.length).toBeLessThan(LIMIT);
      const first = m.items[0];
      if (first) expect((await c.call('get_api', { package: m.package, ...(m.module === null ? {} : { module: m.module }), symbol: first.name })).isError, `${m.import} ${first.name}`).toBe(false);
    }
    const helpers = await c.call('get_api', { package: 'helpers' });
    expect(Array.isArray(helpers.data.modules)).toBe(true);
    expect((await c.call('get_api', { package: 'helpers', module: 'dates' })).text).toContain("'date'");
  });

  it('answers every guide and every guide section', async () => {
    for (const g of snapshot.guides) {
      const r = await c.call('get_guide', { slug: g.slug });
      expect(r.isError, g.slug).toBe(false);
      for (const heading of r.data.outline as readonly string[]) {
        const s = await c.call('get_guide', { slug: g.slug, section: heading });
        expect(s.isError, `${g.slug} / ${heading}`).toBe(false);
        expect(s.text.length).toBeLessThan(LIMIT);
      }
    }
    expect((await c.call('get_guide', { slug: 'forms' })).data.slug).toBe('guides/forms');
  });

  it('answers tokens by group and component', async () => {
    const overview = await c.call('get_tokens');
    for (const group of overview.data.groups as readonly string[]) expect((await c.call('get_tokens', { group })).text.length).toBeLessThan(LIMIT);
    for (const component of snapshot.components) expect((await c.call('get_tokens', { component: component.name })).isError, component.name).toBe(false);
    expect((await c.call('get_tokens', { component: 'chart' })).isError).toBe(false);
  });

  it('lists components by group', async () => {
    const all = await c.call('list_components');
    const groups = all.data.groups as readonly { group: string }[];
    expect(groups.length).toBeGreaterThan(5);
    for (const { group } of groups) {
      const r = await c.call('list_components', { group });
      expect(r.isError, group).toBe(false);
      expect(r.text.length).toBeLessThan(LIMIT);
    }
  });

  it('searches the docs and the icon set', async () => {
    const hits = (await c.call('search_docs', { query: 'date range picker' })).data.hits as readonly JsonObject[];
    expect(hits.slice(0, 3).map((h) => h.id)).toContain('date-range-picker');
    const components = (await c.call('search_docs', { query: 'sortable editable grid with filters', kinds: ['component'], limit: 5 })).data.hits as readonly JsonObject[];
    expect(components.map((h) => h.id)).toContain('data-grid');
    const icons = (await c.call('search_icons', { query: 'delete' })).data.icons as readonly JsonObject[];
    expect(icons[0]?.id).toBe('trash');
    expect(icons[0]?.import).toBe("import { trashIcon } from '@absoluteui/icons/set';");
    expect((await c.call('get_setup', { framework: 'angular' })).isError).toBe(false);
  });
});

describe('resources', () => {
  const c = client();

  it('reads every listed resource and every metadata file', async () => {
    let cursor: string | undefined;
    const uris: string[] = [];
    do {
      const message = await c.request('resources/list', cursor ? { cursor } : {});
      if (!message || !('result' in message)) throw new Error('resources/list failed');
      for (const r of message.result.resources as readonly JsonObject[]) uris.push(typeof r.uri === 'string' ? r.uri : '');
      cursor = typeof message.result.nextCursor === 'string' ? message.result.nextCursor : undefined;
    } while (cursor);
    expect(uris.length).toBeGreaterThan(150);
    for (const uri of uris) {
      const r = await c.request('resources/read', { uri });
      expect(r && 'result' in r, uri).toBe(true);
    }
    for (const component of content().components.slice(0, 10)) {
      for (const file of ['component', 'api', 'accessibility', 'tokens', 'examples']) {
        const r = await c.request('resources/read', { uri: `absoluteui://component/${component.name}/metadata/${file}` });
        expect(r && 'result' in r, `${component.name}/${file}`).toBe(true);
      }
    }
    for (const m of content().api) {
      const r = await c.request('resources/read', { uri: `absoluteui://api/${m.package}/${m.module ?? 'index'}` });
      expect(r && 'result' in r, m.import).toBe(true);
    }
    for (const uri of ['absoluteui://component/../etc', 'absoluteui://component/nope', 'absoluteui://guide/../../x', 'https://example.com']) {
      const r = await c.request('resources/read', { uri });
      expect(r && 'error' in r, uri).toBe(true);
    }
  });

  it('completes template variables', async () => {
    const message = await c.request('completion/complete', { ref: { type: 'ref/resource', uri: 'absoluteui://component/{name}' }, argument: { name: 'name', value: 'date-' } });
    const values = message && 'result' in message ? ((message.result.completion as JsonObject).values as readonly string[]) : [];
    expect(values).toContain('date-picker');
  });
});

describe('prompts', () => {
  const c = client();

  it('lists six prompts and renders each, pointing only at known tools and resources', async () => {
    const list = await c.request('prompts/list');
    const prompts = list && 'result' in list ? (list.result.prompts as readonly JsonObject[]) : [];
    expect(prompts.map((p) => p.name)).toEqual(['build_form', 'add_data_grid', 'build_dashboard', 'choose_component', 'review_accessibility', 'theme_app']);
    const tools = new Set(['search_docs', 'list_components', 'get_component', 'get_examples', 'get_api', 'get_angular', 'get_guide', 'get_tokens', 'search_icons', 'get_setup', 'validate_usage', 'get_schema', 'validate_dashboard']);
    for (const p of prompts) {
      const args: Record<string, string> = {};
      for (const a of p.arguments as readonly JsonObject[]) args[stringOf(a.name)] = a.name === 'framework' ? 'angular' : 'example';
      const message = await c.request('prompts/get', { name: stringOf(p.name), arguments: args });
      if (!message || !('result' in message)) throw new Error(`prompts/get ${stringOf(p.name)} failed`);
      const text = JSON.stringify(message.result.messages);
      for (const uri of text.match(/absoluteui:\/\/[a-z0-9/.-]+/g) ?? []) {
        const r = await c.request('resources/read', { uri: uri.replace(/[.]$/, '') });
        expect(r && 'result' in r, `${stringOf(p.name)}: ${uri}`).toBe(true);
      }
      for (const word of text.match(/\b(?:get|search|list|validate)_[a-z_]+/g) ?? []) expect(tools.has(word), `${stringOf(p.name)}: ${word}`).toBe(true);
    }
  });
});
