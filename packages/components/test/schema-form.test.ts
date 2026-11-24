import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { checkFormSchema, checkUiSchema, evaluateCondition, SchemaForm, schemaFormConfig, type FormSchema, type SchemaFormChangeDetail, type SchemaFormOptions, type SchemaFormSubmitDetail, type UiField } from '@absoluteui/components/schema-form';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const LEAVE: FormSchema = {
  type: 'object',
  title: 'Leave request',
  required: ['type', 'from', 'days'],
  properties: {
    type: { type: 'string', title: 'Leave type', oneOf: [{ const: 'annual', title: 'Annual' }, { const: 'sick', title: 'Sick' }, { const: 'other', title: 'Other' }] },
    reason: { type: 'string', title: 'Reason', maxLength: 200 },
    from: { type: 'string', title: 'First day', format: 'date' },
    days: { type: 'integer', title: 'Days', minimum: 1, maximum: 30 },
    halfDay: { type: 'boolean', title: 'Half day' },
    email: { type: 'string', title: 'Email', format: 'email' },
    code: { type: 'string', title: 'Code', pattern: '^[A-Z]{3}$' },
    contacts: {
      type: 'array',
      title: 'Contacts',
      maxItems: 3,
      items: { type: 'object', title: 'Contact', required: ['name'], properties: { name: { type: 'string', title: 'Name' }, phone: { type: 'string', title: 'Phone' } } },
    },
  },
};

const UI: UiField = { columns: 2, fields: { reason: { widget: 'textarea', visibleIf: { field: 'type', equals: 'other' } }, halfDay: { widget: 'switch' } } };

function mount(options: Partial<SchemaFormOptions> = {}): SchemaForm {
  const host = document.createElement('div');
  document.body.append(host);
  return SchemaForm.create(host, { schema: LEAVE, uiSchema: UI, ...options });
}

const input = (f: SchemaForm, name: string): HTMLInputElement => f.host.querySelector<HTMLInputElement>(`[name="${name}"]`) ?? f.host.querySelector<HTMLInputElement>(`[data-aui-control] input[name="${name}"]`)!;

describe('SchemaForm schema checks', () => {
  it('accepts the supported subset', () => {
    expect(checkFormSchema(LEAVE)).toEqual([]);
    expect(checkUiSchema(LEAVE, UI)).toEqual([]);
  });

  it('reports unsupported keywords and wrong combinations with pointers', () => {
    const issues = checkFormSchema({ type: 'object', properties: { a: { type: 'string', minimum: 2, $ref: '#/x' }, b: { type: 'number', oneOf: [{ type: 'number' }] } }, required: ['c'] });
    const pointers = issues.map((i) => i.pointer);
    expect(pointers).toContain('/properties/a/$ref');
    expect(pointers).toContain('/properties/a/minimum');
    expect(pointers).toContain('/properties/b/oneOf/0');
    expect(pointers).toContain('/required/0');
  });

  it('rejects a root that is not an object, arrays of arrays, and bad patterns', () => {
    expect(checkFormSchema({ type: 'string' }).length).toBeGreaterThan(0);
    expect(checkFormSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } }).length).toBeGreaterThan(0);
    expect(checkFormSchema({ type: 'object', properties: { a: { type: 'string', pattern: '(' } } }).map((i) => i.pointer)).toEqual(['/properties/a/pattern']);
  });

  it('checks the UI schema against the schema', () => {
    const issues = checkUiSchema(LEAVE, { fields: { halfDay: { widget: 'slider' }, days: { widget: 'slider' }, nope: {}, type: { visibleIf: { field: 'missing', equals: 1 } } } });
    const pointers = issues.map((i) => i.pointer);
    expect(pointers).toContain('/fields/halfDay/widget');
    expect(pointers).toContain('/fields/nope');
    expect(pointers).toContain('/fields/type/visibleIf/field');
    expect(pointers).not.toContain('/fields/days/widget');
  });

  it('evaluates conditions without eval', () => {
    const values: Record<string, unknown> = { '/a': 'x', '/b': [], '/c': 3 };
    const read = (f: string): never => values[f] as never;
    expect(evaluateCondition({ field: '/a', equals: 'x' }, read)).toBe(true);
    expect(evaluateCondition({ field: '/a', notEquals: 'x' }, read)).toBe(false);
    expect(evaluateCondition({ field: '/c', in: [1, 3] }, read)).toBe(true);
    expect(evaluateCondition({ field: '/b', filled: false }, read)).toBe(true);
    expect(evaluateCondition({ all: [{ field: '/a', equals: 'x' }, { not: { field: '/c', equals: 4 } }] }, read)).toBe(true);
    expect(evaluateCondition({ any: [{ field: '/a', equals: 'y' }, { field: '/c', equals: 4 }] }, read)).toBe(false);
  });
});

describe('SchemaForm', () => {
  it('throws a configuration error for an unsupported schema before touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => SchemaForm.create(host, { schema: { type: 'object', properties: { a: { type: 'string', allOf: [] } } } as unknown as FormSchema })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    try {
      SchemaForm.create(host, { schema: { type: 'object', properties: { a: { type: 'string', allOf: [] } } } as unknown as FormSchema });
    } catch (e) {
      expect((e as AbsoluteUIError).message).toContain('/properties/a/allOf');
    }
  });

  it('renders AbsoluteUI controls named by JSON Pointer inside a native form', () => {
    const f = mount();
    expect(f.element.tagName).toBe('FORM');
    expect(f.element.getAttribute('aria-label')).toBe('Leave request');
    expect(f.form.controls.map((c) => c.name)).toEqual(expect.arrayContaining(['/type', '/from', '/days', '/halfDay', '/email', '/code']));
    expect(f.host.querySelector('.aui-schema-form__grid--columns')).not.toBeNull();
    // Columns and spans are data attributes the container queries read (R20-24, regression).
    expect(f.host.querySelector<HTMLElement>('.aui-schema-form__grid--columns')?.dataset.columns).toBe('2');
    expect(f.host.querySelector('fieldset.aui-schema-form__array legend')?.textContent).toContain('Contacts');
  });

  it('hides fields whose condition is false and leaves them out of the value and validation', async () => {
    const f = mount({ value: { type: 'annual' } });
    const reason = f.form.controls.find((c) => c.name === '/reason')!;
    expect(reason.host.closest<HTMLElement>('.aui-schema-form__cell')!.hidden).toBe(true);
    expect(reason.disabled).toBe(true);
    f.setValue({ type: 'other', reason: 'Moving house' });
    const shown = f.form.controls.find((c) => c.name === '/reason')!;
    expect(shown.host.closest<HTMLElement>('.aui-schema-form__cell')!.hidden).toBe(false);
    expect(f.getValue()).toMatchObject({ type: 'other', reason: 'Moving house' });
    await Promise.resolve();
  });

  it('serializes typed JSON: integers, booleans, enum constants, dates', () => {
    const f = mount({ value: { type: 'sick', from: '2026-12-01', days: 2, halfDay: true } });
    expect(f.getValue()).toEqual({ type: 'sick', from: '2026-12-01', days: 2, halfDay: true, contacts: [] });
  });

  it('blocks submission with the Error Summary and emits aui-submit with the validated value', async () => {
    const f = mount();
    const submits: unknown[] = [];
    f.host.addEventListener('aui-submit', (e) => submits.push((e as CustomEvent<SchemaFormSubmitDetail>).detail.value));
    f.submit();
    await new Promise((r) => setTimeout(r, 0));
    expect(submits).toHaveLength(0);
    expect(f.host.querySelector('.aui-error-summary')).not.toBeNull();
    f.setValue({ type: 'annual', from: '2026-12-01', days: 3 });
    f.submit();
    await new Promise((r) => setTimeout(r, 0));
    expect(submits).toEqual([{ type: 'annual', from: '2026-12-01', days: 3, halfDay: false, contacts: [] }]);
  });

  it('checks the pattern with JSON Schema (unanchored ECMAScript) semantics', async () => {
    const f = mount({ value: { type: 'annual', from: '2026-12-01', days: 1, code: 'abc' } });
    expect(f.validate()).toBe(false);
    f.setValue({ type: 'annual', from: '2026-12-01', days: 1, code: 'ABC' });
    expect(f.validate()).toBe(true);
    await Promise.resolve();
  });

  it('adds, reorders, and removes array items with buttons and announces it', async () => {
    const f = mount();
    const add = f.host.querySelector<HTMLButtonElement>('.aui-schema-form__add')!;
    await userEvent.click(add);
    await userEvent.click(add);
    const names = (): string[] => [...f.host.querySelectorAll<HTMLElement>('.aui-schema-form__item legend')].map((l) => l.textContent);
    expect(names()[0]).toContain('Contact 1');
    expect(f.form.controls.map((c) => c.name)).toEqual(expect.arrayContaining(['/contacts/0/name', '/contacts/1/name']));
    f.setValue({ contacts: [{ name: 'Ana' }, { name: 'Bo' }] });
    const down = [...f.host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === 'Move Contact 1 down')!;
    await userEvent.click(down);
    expect((f.getValue().contacts as { name: string }[]).map((c) => c.name)).toEqual(['Bo', 'Ana']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Contact 2 up');
    const remove = [...f.host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === 'Remove Contact 1')!;
    await userEvent.click(remove);
    expect(f.getValue().contacts).toEqual([{ name: 'Ana' }]);
  });

  it('disables add at maxItems', () => {
    const f = mount({ value: { contacts: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } });
    expect(f.host.querySelector<HTMLButtonElement>('.aui-schema-form__add')!.disabled).toBe(true);
  });

  it('maps server errors by JSON Pointer to fields, groups, and the summary', () => {
    // Days holds a valid value: a built-in constraint error (here: required) takes precedence over an external one.
    const f = mount({ value: { days: 20, contacts: [{ name: 'Ana' }] } });
    f.setErrors({ '/days': 'Too many days for your balance.', '/contacts': 'Check the contacts.', '': 'Request window closed.' });
    expect(f.form.controls.find((c) => c.name === '/days')!.validity.message).toBe('Too many days for your balance.');
    expect(f.host.querySelector('.aui-schema-form__array.aui-fieldset--invalid')).not.toBeNull();
    expect(f.host.querySelector('.aui-error-summary')?.textContent).toContain('Request window closed.');
    f.clearErrors();
    expect(f.host.querySelector('.aui-schema-form__array.aui-fieldset--invalid')).toBeNull();
  });

  it('reports aui-change with the whole value and the pointer; control events do not leak', async () => {
    const f = mount();
    const changes: SchemaFormChangeDetail[] = [];
    f.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<SchemaFormChangeDetail>).detail));
    await userEvent.click(input(f, '/email'));
    await userEvent.keyboard('a');
    expect(changes.at(-1)?.pointer).toBe('/email');
    expect(changes.at(-1)?.value).toMatchObject({ email: 'a' });
    expect(changes.every((c) => 'value' in c && 'pointer' in c)).toBe(true);
  });

  it('runs the async validator with the JSON value and shows its pointer errors', async () => {
    const seen: unknown[] = [];
    const f = mount({
      value: { type: 'annual', from: '2026-12-01', days: 3 },
      validate: (value) => {
        seen.push(value);
        return Promise.resolve({ '/from': 'That day is a public holiday.' });
      },
    });
    f.submit();
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toHaveLength(1);
    expect(f.form.controls.find((c) => c.name === '/from')!.validity.message).toBe('That day is a public holiday.');
  });

  it('honours the global showActions configuration and the submit label', () => {
    configureAbsoluteUI({ components: { schemaForm: { showActions: false } } });
    const f = mount({ submitLabel: 'Request leave' });
    expect(f.host.querySelector<HTMLElement>('.aui-schema-form__actions')!.hidden).toBe(true);
    expect(f.host.querySelector('button[type="submit"]')?.textContent).toBe('Request leave');
    expect(schemaFormConfig.optionNames).toContain('showActions');
  });

  it('reset restores the initial value including array entries', () => {
    const f = mount({ value: { contacts: [{ name: 'Ana' }] } });
    f.setValue({ contacts: [] });
    f.reset();
    expect(f.getValue().contacts).toEqual([{ name: 'Ana' }]);
  });

  it('destroy empties the host', () => {
    const f = mount();
    f.destroy();
    expect(f.host.childElementCount).toBe(0);
    expect(f.host.classList.contains('aui-schema-form')).toBe(false);
  });
});
