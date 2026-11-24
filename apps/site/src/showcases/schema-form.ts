// Form builder showcase: an HR administrator builds a leave request form in Form Builder
// (palette, canvas reordering by pointer or keyboard, properties, JSON, undo), and the published
// Schema Form below renders the same document live. Submitting shows the validated JSON value; a
// simulated server rejects a date with an error mapped back by JSON Pointer.
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { FormBuilder, type FormBuilderChangeDetail } from '@absoluteui/components/form-builder';
import { SchemaForm, type FormSchema, type SchemaFormSubmitDetail, type UiField } from '@absoluteui/components/schema-form';
import { parsePlainDate, plainDate } from '@absoluteui/core';
import { action, createShowcase, hostIn, section, status, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Form builder',
  description: 'Build a leave request form: add field types from the palette, reorder them by dragging or with the keyboard, and edit their properties. The published form below follows every change.',
  simulated: true,
});

const LEAVE: FormSchema = {
  type: 'object',
  title: 'Leave request',
  required: ['type', 'from', 'days'],
  properties: {
    type: { type: 'string', title: 'Leave type', oneOf: [{ const: 'annual', title: 'Annual leave' }, { const: 'sick', title: 'Sick leave' }, { const: 'other', title: 'Other' }] },
    reason: { type: 'string', title: 'Reason', description: 'Tell your manager why you need the time off.', maxLength: 500 },
    from: { type: 'string', title: 'First day', format: 'date' },
    days: { type: 'integer', title: 'Working days', minimum: 1, maximum: 30 },
    halfDay: { type: 'boolean', title: 'Start with a half day' },
    cover: { type: 'string', title: 'Who covers for you?', format: 'email' },
  },
};
const LEAVE_UI: UiField = {
  columns: 2,
  order: ['type', 'reason', 'from', 'days', 'halfDay', 'cover'],
  fields: {
    reason: { widget: 'textarea', span: 2, visibleIf: { field: 'type', equals: 'other' } },
    from: { disableNonWorking: true },
    halfDay: { widget: 'switch' },
    cover: { placeholder: 'colleague@example.com' },
  },
};

// Company calendar: Monday to Friday with two public holidays (date fields skip them).
const calendar = createBusinessCalendar({ workingDays: [1, 2, 3, 4, 5], holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day' }, { date: plainDate(2027, 1, 1), name: "New Year's Day" }] });

const builderSection = section(sc, 'Designer', ['form-builder']);
const builderHost = hostIn(builderSection);
const builder = FormBuilder.create(builderHost, { label: 'Leave request form', schema: LEAVE, uiSchema: LEAVE_UI });
sc.listen(builderHost, ['aui-change'], 'builder');

const formSection = section(sc, 'Published form', ['schema-form', 'form-builder']);
const formHost = hostIn(formSection);
const form = SchemaForm.create(formHost, { schema: LEAVE, uiSchema: LEAVE_UI, businessCalendar: calendar, submitLabel: 'Request leave' });
sc.listen(formHost, ['aui-change', 'aui-invalid'], 'form');
const result = status(formSection);
result.textContent = 'Submit the form to see its JSON value.';

let serverRejects = false;
builderHost.addEventListener('aui-change', (e) => {
  const { schema, uiSchema } = (e as CustomEvent<FormBuilderChangeDetail>).detail;
  form.update({ schema, uiSchema });
});
formHost.addEventListener('aui-submit', (e) => {
  const { value } = (e as CustomEvent<SchemaFormSubmitDetail>).detail;
  sc.log('form aui-submit', value);
  const from = typeof value.from === 'string' ? parsePlainDate(value.from) : null;
  if (serverRejects && from) {
    // The simulated server answers 422 with errors by JSON Pointer.
    form.setErrors({ '/from': 'Your team already has two people away that week. Pick another first day.' });
    result.textContent = 'The server rejected the request (see the error on First day).';
    return;
  }
  result.textContent = `Submitted value: ${JSON.stringify(value)}`;
});

action(sc, 'Start empty', () => {
  builder.setValue({ type: 'object', title: 'Leave request', properties: {} }, {});
  form.update({ schema: { type: 'object', title: 'Leave request', properties: {} }, uiSchema: {}, value: {} });
  sc.log('builder cleared');
}, ['form-builder']);
action(sc, 'Build leave request', () => {
  builder.setValue(LEAVE, LEAVE_UI);
  form.update({ schema: LEAVE, uiSchema: LEAVE_UI, value: {} });
  sc.log('builder loaded the leave request');
}, ['form-builder']);
action(sc, 'Fill sample answers', () => {
  form.setValue({ type: 'annual', from: '2026-12-21', days: 4, cover: 'sam.lee@example.com' });
});
toggle(sc, 'Server rejects the date', false, (on) => {
  serverRejects = on;
});
toggle(sc, 'Show reset', false, (showReset) => {
  form.update({ showReset });
});
toggle(sc, 'Disabled', false, (disabled) => {
  form.update({ disabled });
});
