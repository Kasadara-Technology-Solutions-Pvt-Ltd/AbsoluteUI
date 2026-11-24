import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { FormBuilder, formBuilderConfig, type FormBuilderChangeDetail, type FormBuilderOptions } from '@absoluteui/components/form-builder';
import { checkFormSchema, checkUiSchema } from '@absoluteui/components/schema-form';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<FormBuilderOptions> = {}): FormBuilder {
  const host = document.createElement('div');
  document.body.append(host);
  return FormBuilder.create(host, { label: 'Leave request form', ...options });
}

const button = (b: FormBuilder, text: string): HTMLButtonElement => [...b.host.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent.trim() === text || x.getAttribute('aria-label') === text)!;

describe('FormBuilder', () => {
  it('validates options', () => {
    const host = document.createElement('div');
    expect(() => FormBuilder.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => FormBuilder.create(host, { label: 'x', fieldTypes: ['nope' as never] })).toThrow(AbsoluteUIError);
    expect(() => FormBuilder.create(host, { label: 'x', schema: { type: 'object', properties: { a: { type: 'string', allOf: [] } } } as never })).toThrow(AbsoluteUIError);
    expect(formBuilderConfig.optionNames).toContain('historyLimit');
  });

  it('adds fields from the palette and emits a valid document', async () => {
    const b = mount();
    const changes: FormBuilderChangeDetail[] = [];
    b.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<FormBuilderChangeDetail>).detail));
    await userEvent.click(button(b, 'Dropdown'));
    await userEvent.click(button(b, 'Date'));
    const last = changes.at(-1)!;
    expect(Object.keys(last.schema.properties ?? {})).toEqual(['select1', 'date1']);
    expect(last.schema.properties?.date1).toMatchObject({ type: 'string', format: 'date', title: 'Date' });
    expect(checkFormSchema(last.schema)).toEqual([]);
    expect(checkUiSchema(last.schema, last.uiSchema)).toEqual([]);
    expect(b.selected).toBe('date1');
  });

  it('inserts after the selected field and reorders with the keyboard', async () => {
    const b = mount();
    b.addField('text');
    b.addField('number');
    b.selectField('text1');
    b.addField('email');
    expect(b.getValue().uiSchema.order).toEqual(['text1', 'email1', 'number1']);
    const handle = b.host.querySelector<HTMLButtonElement>('.aui-sortable-list__handle')!;
    handle.focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard(' ');
    expect(b.getValue().uiSchema.order).toEqual(['email1', 'text1', 'number1']);
  });

  it('edits properties: label, required, rename keeps required and conditions', async () => {
    const b = mount();
    b.addField('select');
    b.addField('text');
    b.selectField('text1');
    const name = [...b.host.querySelectorAll<HTMLInputElement>('input')].find((i) => i.closest('[data-aui-control]')?.textContent.includes('Name'))!;
    await userEvent.clear(name);
    await userEvent.type(name, 'reason');
    await userEvent.tab();
    expect(Object.keys(b.getValue().schema.properties ?? {})).toContain('reason');
    expect(b.selected).toBe('reason');
  });

  it('panel controls keep working after the panel re-renders (regression)', async () => {
    const b = mount();
    const field = (label: string): HTMLInputElement => [...b.host.querySelectorAll<HTMLInputElement>('.aui-form-builder__panel input')].find((i) => i.closest('[data-aui-control]')?.querySelector('label')?.textContent.includes(label))!;
    await userEvent.type(field('Form title'), 'Leave');
    await userEvent.tab();
    expect(b.getValue().schema.title).toBe('Leave');
    b.addField('text');
    b.selectField('text1');
    const label = field('Label');
    await userEvent.clear(label);
    await userEvent.type(label, 'Reason');
    await userEvent.tab();
    expect(b.getValue().schema.properties?.text1?.title).toBe('Reason');
  });

  it('undo and redo restore documents; Ctrl+Z works outside text fields', async () => {
    const b = mount();
    b.addField('text');
    b.addField('checkbox');
    expect(b.canUndo).toBe(true);
    b.undo();
    expect(Object.keys(b.getValue().schema.properties ?? {})).toEqual(['text1']);
    b.redo();
    expect(Object.keys(b.getValue().schema.properties ?? {})).toEqual(['text1', 'checkbox1']);
    button(b, 'Undo').focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(Object.keys(b.getValue().schema.properties ?? {})).toEqual(['text1']);
  });

  it('removes a field with its button and the Delete key, dropping conditions that used it', () => {
    const b = mount({
      schema: { type: 'object', properties: { a: { type: 'boolean', title: 'A' }, b: { type: 'string', title: 'B' } } },
      uiSchema: { fields: { b: { visibleIf: { field: 'a', equals: true } } } },
    });
    b.removeField('a');
    expect(b.getValue().uiSchema.fields?.b?.visibleIf).toBeUndefined();
    expect(b.getValue().schema.properties?.a).toBeUndefined();
  });

  it('rejects invalid JSON imports and applies valid ones', async () => {
    const b = mount();
    await userEvent.click([...b.host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent.includes('JSON'))!);
    // The JSON view's textarea, not the Description field of the form settings panel (first in DOM order).
    const area = b.host.querySelector<HTMLTextAreaElement>('.aui-form-builder__json textarea')!;
    area.value = '{ "schema": { "type": "object", "properties": { "a": { "type": "string", "allOf": [] } } } }';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await userEvent.click(button(b, 'Apply JSON'));
    expect(b.host.textContent).toContain('/properties/a/allOf');
    area.value = '{ "schema": { "type": "object", "properties": { "a": { "type": "string", "title": "A" } } } }';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await userEvent.click(button(b, 'Apply JSON'));
    expect(Object.keys(b.getValue().schema.properties ?? {})).toEqual(['a']);
  });

  it('previews the document with Schema Form', async () => {
    const b = mount({ schema: { type: 'object', properties: { a: { type: 'string', title: 'A' } } } });
    await userEvent.click([...b.host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent.includes('Preview'))!);
    expect(b.host.querySelector('.aui-schema-form')).not.toBeNull();
  });

  it('destroy empties the host', () => {
    const b = mount();
    b.destroy();
    expect(b.host.childElementCount).toBe(0);
  });
});
