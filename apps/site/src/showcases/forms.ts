// Forms showcase: an employee profile form that uses every form control together,
// with constraint validation, a cross-field rule, the error summary, reset, and live options.
import { Button } from '@absoluteui/components/button';
import { Checkbox } from '@absoluteui/components/checkbox';
import { CheckboxGroup } from '@absoluteui/components/checkbox-group';
import { Combobox } from '@absoluteui/components/combobox';
import { Fieldset } from '@absoluteui/components/fieldset';
import { Form, type FormSubmitDetail } from '@absoluteui/components/form';
import { FormField } from '@absoluteui/components/form-field';
import { MultiSelect } from '@absoluteui/components/multi-select';
import { NumberInput } from '@absoluteui/components/number-input';
import { RadioGroup } from '@absoluteui/components/radio-group';
import { Select } from '@absoluteui/components/select';
import { Slider } from '@absoluteui/components/slider';
import { Switch } from '@absoluteui/components/switch';
import { TextInput } from '@absoluteui/components/text-input';
import { Textarea } from '@absoluteui/components/textarea';
import { ValidationMessage } from '@absoluteui/components/validation-message';
import { action, annotate, choice, createShowcase, hostIn, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Employee profile',
  description: 'Every form control in one form: required fields, formats, ranges, a cross-field rule, and an error summary on submit.',
});

const form = document.createElement('form');
form.className = 'sc-form';
form.noValidate = true;
sc.stage.append(form);

// Each fieldset declares its controls, so a component's focus view shows its own group.
const fieldset = (legend: string, description?: string): HTMLFieldSetElement => {
  const fs = document.createElement('fieldset');
  form.append(fs);
  Fieldset.enhance(fs, { legend, ...(description ? { description } : {}) });
  return fs;
};

const DEPARTMENTS = [
  { value: 'eng', label: 'Engineering' },
  { value: 'fin', label: 'Finance' },
  { value: 'hr', label: 'People' },
  { value: 'ops', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
];
const MANAGERS = ['Ada Kowalski', 'Bruno Silva', 'Chen Wei', 'Divya Nair', 'Emeka Obi', 'Farah Haddad', 'Grace Liu', 'Hiro Tanaka'].map((name) => ({ value: name.toLowerCase().replace(/\s+/g, '-'), label: name }));
const SKILLS = ['Accessibility', 'Angular', 'Data analysis', 'Design systems', 'Finance', 'Negotiation', 'People management', 'TypeScript'].map((s) => ({ value: s.toLowerCase().replace(/\s+/g, '-'), label: s }));

// Personal details.
const personal = annotate(fieldset('Personal details'), ['form', 'error-summary', 'fieldset', 'text-input', 'textarea', 'form-field']);
const name = TextInput.create(hostIn(personal), { label: 'Full name', name: 'name', required: true, minLength: 2, autocomplete: 'name' });
const email = TextInput.create(hostIn(personal), { label: 'Work email', name: 'email', type: 'email', required: true, autocomplete: 'email', description: 'Used for sign-in and notifications.' });
const phone = TextInput.create(hostIn(personal), { label: 'Phone', name: 'phone', type: 'tel', inputMode: 'tel', pattern: '[+]?[0-9 ]{7,20}', description: 'Digits and spaces, with an optional leading +.' });
const bio = Textarea.create(hostIn(personal), { label: 'About', name: 'bio', maxLength: 280, showCounter: true, rows: 3, resize: 'vertical' });

// A native control labelled and validated by Form Field.
const badge = document.createElement('input');
badge.name = 'badge';
badge.inputMode = 'numeric';
badge.pattern = '[0-9]{6}';
FormField.create(hostIn(personal), { label: 'Badge number', control: badge, description: 'Six digits printed on your badge.' });

// Role.
const role = annotate(fieldset('Role'), ['form', 'error-summary', 'validation-message', 'fieldset', 'select', 'combobox', 'radio-group', 'number-input', 'slider', 'multi-select']);
const department = Select.create(hostIn(role), { label: 'Department', name: 'department', options: DEPARTMENTS, placeholder: 'Choose a department', required: true });
const manager = Combobox.create(hostIn(role), { label: 'Manager', name: 'manager', options: MANAGERS, placeholder: 'Type a name', description: 'Search by first or last name.' });
const type = RadioGroup.create(hostIn(role), { label: 'Employment type', name: 'type', orientation: 'horizontal', required: true, options: [{ value: 'full', label: 'Full time' }, { value: 'part', label: 'Part time' }, { value: 'contract', label: 'Contractor' }] });
const salary = NumberInput.create(hostIn(role), { label: 'Annual salary', name: 'salary', min: 10000, max: 500000, step: 1000, format: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 } });
const hours = Slider.create(hostIn(role), { label: 'Weekly hours', name: 'hours', min: 8, max: 48, step: 1, largeStep: 4, value: 40, marks: [{ value: 20, label: '20' }, { value: 40, label: '40' }], showValue: true });
const skills = MultiSelect.create(hostIn(role), { label: 'Skills', name: 'skills', options: SKILLS, maxSelected: 5, description: 'Up to five.' });

// Preferences.
const prefs = annotate(fieldset('Preferences', 'You can change these later in settings.'), ['form', 'error-summary', 'fieldset', 'checkbox-group', 'switch', 'checkbox']);
const benefits = CheckboxGroup.create(hostIn(prefs), { label: 'Benefits', name: 'benefits', orientation: 'horizontal', options: [{ value: 'health', label: 'Health' }, { value: 'pension', label: 'Pension' }, { value: 'transit', label: 'Transit pass' }, { value: 'gym', label: 'Gym' }] });
const remote = Switch.create(hostIn(prefs), { label: 'Works remotely', name: 'remote' });
const terms = Checkbox.create(hostIn(prefs), { label: 'I confirm these details are correct', name: 'terms', required: true });

// A standalone validation message for a rule that is not tied to one control.
const actions = annotate(hostIn(form), ['form', 'error-summary', 'validation-message']);
actions.className = 'sc-form__actions';
const hint = ValidationMessage.create(hostIn(actions), { tone: 'info', message: 'Part-time employees work at most 32 hours per week.' });

const buttons = hostIn(actions);
buttons.className = 'sc-form__buttons';
const submit = Button.create({ text: 'Save profile', variant: 'primary', type: 'submit' }, document);
const reset = Button.create({ text: 'Reset', variant: 'secondary', type: 'reset' }, document);
buttons.append(submit.element, reset.element);

const formController = Form.create(form, {
  summaryTitle: 'Fix these fields to save the profile',
  rules: [
    {
      fields: ['type', 'hours'],
      validate: (values) => (values.type === 'part' && Number(values.hours) > 32 ? 'Part-time employees work at most 32 hours per week.' : null),
    },
  ],
});

form.addEventListener('aui-submit', (e) => {
  const { values } = (e as CustomEvent<FormSubmitDetail>).detail;
  submit.setLoading(true);
  // A save takes a moment; the button stays busy and focusable meanwhile.
  setTimeout(() => {
    submit.setLoading(false);
    hint.update({ tone: 'success', message: `Saved the profile of ${typeof values.name === 'string' ? values.name : 'the employee'}.` });
  }, 600);
});
form.addEventListener('aui-reset', () => {
  hint.update({ tone: 'info', message: 'Part-time employees work at most 32 hours per week.' });
});

sc.listen(form, ['aui-submit', 'aui-invalid', 'aui-reset'], 'form');
for (const [label, host] of [
  ['name', name.host],
  ['email', email.host],
  ['department', department.host],
  ['manager', manager.host],
  ['type', type.host],
  ['salary', salary.host],
  ['hours', hours.host],
  ['skills', skills.host],
  ['benefits', benefits.host],
  ['remote', remote.host],
  ['terms', terms.host],
] as const) {
  sc.listen(host, ['aui-change'], label);
}

// Options.
const all = [name, email, phone, bio, department, manager, type, salary, hours, skills, benefits, remote, terms];
toggle(sc, 'Disabled', false, (disabled) => {
  for (const c of all) c.update({ disabled });
  badge.disabled = disabled;
  submit.update({ disabled });
});
toggle(sc, 'Read-only', false, (readOnly) => {
  for (const c of [name, email, phone, bio, department, manager, salary, skills]) c.update({ readOnly });
  badge.readOnly = readOnly;
});
choice(
  sc,
  'Validate',
  [
    { value: 'blur', label: 'When leaving a field' },
    { value: 'input', label: 'While typing' },
    { value: 'submit', label: 'On submit only' },
  ],
  'blur',
  (timing) => {
    for (const c of [name, email, phone, bio, department, type, salary, benefits, terms]) c.update({ validationTiming: timing });
  },
);
action(sc, 'Fill sample data', () => {
  name.setValue('Ada Lovelace');
  email.setValue('ada@example.com');
  phone.setValue('+44 20 7946 0000');
  bio.setValue('Writes the first programs and reviews every pull request.');
  badge.value = '204816';
  department.setValue('eng');
  manager.setValue('chen-wei');
  type.setValue('full');
  salary.setValue(86000);
  hours.setValue(38);
  skills.setValue(['typescript', 'accessibility']);
  benefits.setValue(['health', 'pension']);
  remote.setChecked(true);
  terms.setChecked(true);
  sc.log('sample data filled');
});
action(sc, 'Submit empty', () => {
  formController.reset();
  formController.submit();
}, ['form', 'error-summary']);
