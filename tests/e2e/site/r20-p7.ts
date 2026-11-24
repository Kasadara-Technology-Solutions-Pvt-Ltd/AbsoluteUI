// R20 P7 page: Schema Form and Form Builder (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { FormBuilder, type FormBuilderChangeDetail } from '@absoluteui/components/form-builder';
import { SchemaForm, type FormSchema, type SchemaFormSubmitDetail } from '@absoluteui/components/schema-form';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const schema: FormSchema = {
  type: 'object',
  title: 'Leave request',
  required: ['type', 'from', 'days'],
  properties: {
    type: { type: 'string', title: 'Leave type', oneOf: [{ const: 'annual', title: 'Annual leave' }, { const: 'other', title: 'Other' }] },
    reason: { type: 'string', title: 'Reason', maxLength: 200 },
    from: { type: 'string', title: 'First day', format: 'date' },
    days: { type: 'integer', title: 'Working days', minimum: 1, maximum: 30 },
    halfDay: { type: 'boolean', title: 'Half day' },
    contacts: { type: 'array', title: 'Contacts', maxItems: 3, items: { type: 'object', title: 'Contact', required: ['name'], properties: { name: { type: 'string', title: 'Name' }, phone: { type: 'string', title: 'Phone' } } } },
  },
};

const sfHost = byId('sf');
SchemaForm.create(sfHost, {
  schema,
  uiSchema: { columns: 2, fields: { reason: { widget: 'textarea', span: 2, visibleIf: { field: 'type', equals: 'other' } }, halfDay: { widget: 'switch' }, contacts: { span: 2 } } },
  value: params.has('filled') ? { type: 'annual', from: '2026-12-21', days: 3 } : {},
  submitLabel: 'Request leave',
});
sfHost.addEventListener('aui-submit', (e) => {
  byId('sf-value').textContent = JSON.stringify((e as CustomEvent<SchemaFormSubmitDetail>).detail.value);
});

const fbHost = byId('fb');
FormBuilder.create(fbHost, { label: 'Leave request form', schema: { type: 'object', title: 'Leave request', properties: { from: { type: 'string', title: 'First day', format: 'date' } } } });
fbHost.addEventListener('aui-change', (e) => {
  byId('fb-value').textContent = JSON.stringify((e as CustomEvent<FormBuilderChangeDetail>).detail);
});

Object.assign(window, { __auiReady: true });
