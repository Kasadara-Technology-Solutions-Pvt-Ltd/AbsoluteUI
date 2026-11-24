// validate_usage, get_schema, and validate_dashboard against the real content.
import { describe, expect, it } from 'vitest';
import { client } from './support.js';
import { mask, objectKeys, matching } from '../src/validate/scan.js';
import { stringOf, type JsonObject } from '../src/protocol/jsonrpc.js';

const c = client();
const rules = async (code: string, framework: 'ts' | 'angular' = 'ts'): Promise<string[]> => {
  const r = await c.call('validate_usage', { code, framework });
  expect(r.isError, r.text).toBe(false);
  return (r.data.diagnostics as readonly JsonObject[]).map((d) => `${stringOf(d.severity)} ${stringOf(d.rule)}: ${stringOf(d.message)}`);
};

describe('validate_usage (TypeScript)', () => {
  it('passes correct usage without errors', async () => {
    const code = [
      "import '@absoluteui/theme/absolute-default.css';",
      "import '@absoluteui/components/select/style.css';",
      "import { Select } from '@absoluteui/components/select';",
      "const country = Select.create(host, { label: 'Country', name: 'country', required: true, options: [{ value: 'in', label: 'India' }] });",
      "host.addEventListener('aui-change', () => country.focus());",
      "country.setValue('in');",
    ].join('\n');
    expect(await rules(code)).toEqual([]);
  });

  it('reports unknown options with suggestions, missing labels, and unknown methods', async () => {
    const code = "import { Select } from '@absoluteui/components/select';\nconst s = Select.create(host, { lable: 'Country', options: [] });\ns.open();\ns.setVal('x');";
    const found = await rules(code);
    expect(found).toContain("error unknown-option: Select has no option 'lable'. Did you mean 'label'?");
    expect(found).toContain("error accessible-name: Select needs the option 'label' (its accessible name).");
    expect(found.some((d) => d.startsWith("warning unknown-method: Select has no method 'setVal'"))).toBe(true);
    expect(found.some((d) => d.includes("method 'open'"))).toBe(false);
  });

  it('does not report keys inside nested objects, strings, or comments, and skips required checks with a spread', async () => {
    const code = "import { Select } from '@absoluteui/components/select';\nimport '@absoluteui/components/select/style.css';\n// Select.create(host, { bogus: 1 })\nSelect.create(host, { ...base, options: [{ value: 'a', label: 'A', bogus: 1 }], placeholder: 'x: { y }' });";
    expect((await rules(code)).filter((d) => d.startsWith('error') || d.startsWith('warning'))).toEqual([]);
  });

  it('flags entry points, adapters, stylesheets, events, CSP, icons, and removed components', async () => {
    const code = [
      "import { DataGrid } from '@absoluteui/components/datagrid';",
      "import { Button } from '@absoluteui/react';",
      "import '@absoluteui/components/button/styles.css';",
      "import { Trash } from 'lucide';",
      "import { SankeyChart } from '@absoluteui/components/sankey-chart';",
      "import { addBusinessDayz } from '@absoluteui/helpers/business-calendar';",
      "el.insertAdjacentHTML('beforeend', html);",
      "setTimeout('run()', 10);",
      "document.addEventListener('aui-opne', f);",
    ].join('\n');
    const found = await rules(code);
    expect(found).toEqual(expect.arrayContaining([
      expect.stringMatching(/^error unknown-entry-point: '@absoluteui\/components\/datagrid' is not a published entry point\. Did you mean '@absoluteui\/components\/data-grid'/),
      expect.stringMatching(/^error unavailable-adapter: '@absoluteui\/react' is not available/),
      expect.stringMatching(/^error unknown-entry-point: Unknown stylesheet '@absoluteui\/components\/button\/styles\.css'/),
      expect.stringMatching(/^info icon-set: 'lucide' is a third-party icon library/),
      expect.stringMatching(/^error unknown-entry-point: '@absoluteui\/components\/sankey-chart' is not part of AbsoluteUI/),
      expect.stringMatching(/^error unknown-export: 'addBusinessDayz' is not exported by @absoluteui\/helpers\/business-calendar/),
      expect.stringMatching(/^error csp: insertAdjacentHTML/),
      expect.stringMatching(/^error csp: String-based timers/),
      expect.stringMatching(/^error unknown-event: No AbsoluteUI component emits 'aui-opne'/),
    ]));
  });

  it('reports line and column', async () => {
    const r = await c.call('validate_usage', { framework: 'ts', code: "const a = 1;\n  el.innerHTML = a;" });
    expect((r.data.diagnostics as readonly JsonObject[])[0]).toMatchObject({ rule: 'csp', line: 2, column: 5 });
  });

  it('stays fast on large adversarial input', async () => {
    const code = `${'import '.repeat(7000)}${'{'.repeat(1000)}`;
    const started = performance.now();
    const r = await c.call('validate_usage', { framework: 'ts', code });
    expect(r.isError).toBe(false);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('validate_usage (Angular)', () => {
  it('checks selectors, inputs, outputs, and declarations', async () => {
    const code = [
      "import { AuiSelect, AuiSelectX } from '@absoluteui/angular/select';",
      '@Component({ imports: [AuiSelect], template: `',
      '  <aui-select label="Country" [options]="countries" [(value)]="country" (changed)="save($event)" class="wide" aria-describedby="h" [formControl]="c"></aui-select>',
      '  <aui-selct></aui-selct>',
      '  <aui-select label="x" [optons]="o" (chnaged)="f()"></aui-select>',
      '` })',
      'export class Shipping {}',
    ].join('\n');
    const found = await rules(code, 'angular');
    expect(found).toEqual(expect.arrayContaining([
      expect.stringMatching(/^error unknown-export: 'AuiSelectX' is not declared by @absoluteui\/angular\/select/),
      expect.stringMatching(/^error unknown-selector: <aui-selct> is not an AbsoluteUI Angular selector\. Did you mean '<?aui-select/),
      expect.stringMatching(/^error unknown-input: <aui-select> has no input 'optons'/),
      expect.stringMatching(/^error unknown-output: <aui-select> has no output 'chnaged'/),
    ]));
    for (const name of ['label', 'options', 'value', 'changed', 'class', 'aria-describedby', 'formControl']) expect(found.some((d) => d.includes(`has no input '${name}'`) || d.includes(`has no output '${name}'`))).toBe(false);
  });
});

describe('dashboard tools', () => {
  const valid = { schemaVersion: 1, id: 'sales', title: 'Sales', widgets: [{ id: 'note', type: 'text', title: 'Note', options: { text: 'hi' }, layout: { x: 0, y: 0, w: 3, h: 2 } }] };

  it('returns the library schema', async () => {
    const r = await c.call('get_schema', { name: 'dashboard' });
    expect((r.data.schema as JsonObject).title).toBe('AbsoluteUI dashboard definition');
    const restricted = await c.call('get_schema', { name: 'dashboard', widgetTypes: ['text'] });
    expect(JSON.stringify(restricted.data.schema)).toContain('"text"');
  });

  it('accepts a valid definition and reports issues of an invalid one', async () => {
    expect((await c.call('validate_dashboard', { definition: JSON.stringify(valid) })).data).toMatchObject({ valid: true, issues: [] });
    const duplicate = { ...valid, widgets: [...valid.widgets, ...valid.widgets] };
    const r = await c.call('validate_dashboard', { definition: JSON.stringify(duplicate) });
    expect(r.data.valid).toBe(false);
    expect((r.data.issues as readonly JsonObject[]).some((i) => i.code === 'duplicate-id')).toBe(true);
  });

  it('rejects invalid JSON, deep nesting, and newer versions', async () => {
    expect((await c.call('validate_dashboard', { definition: '{oops' })).text).toMatch(/not valid JSON/);
    expect((await c.call('validate_dashboard', { definition: `${'['.repeat(100)}${']'.repeat(100)}` })).text).toMatch(/nested deeper/);
    const newer = await c.call('validate_dashboard', { definition: JSON.stringify({ ...valid, schemaVersion: 99 }) });
    expect(newer.data).toMatchObject({ valid: false, issues: [{ path: '/schemaVersion', code: 'version' }] });
  });
});

describe('scanner', () => {
  it('masks strings and comments and finds top-level keys', () => {
    const source = "f({ a: 1, 'b': 2, c, ...d, e() {}, get g() { return 1 }, h: { i: 1 } }) // { z: 1 }";
    const { code } = mask(source);
    const open = code.indexOf('{');
    const { names, spread } = objectKeys(code, open, matching(code, open));
    expect(names.map((n) => n.name)).toEqual(['a', 'c', 'e', 'g', 'h']);
    expect(spread).toBe(true);
  });
});
