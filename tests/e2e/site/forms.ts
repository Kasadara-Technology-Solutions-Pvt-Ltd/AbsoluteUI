// R1 forms page, bundled against the built packages (package "exports").
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { TextInput } from '@absoluteui/components/text-input';
import { Textarea } from '@absoluteui/components/textarea';
import { NumberInput } from '@absoluteui/components/number-input';
import { Select } from '@absoluteui/components/select';
import { Combobox } from '@absoluteui/components/combobox';
import { DateInput } from '@absoluteui/components/date-input';
import { RadioGroup } from '@absoluteui/components/radio-group';
import { CheckboxGroup } from '@absoluteui/components/checkbox-group';
import { MultiSelect } from '@absoluteui/components/multi-select';
import { Checkbox } from '@absoluteui/components/checkbox';
import { Switch } from '@absoluteui/components/switch';
import { FormField } from '@absoluteui/components/form-field';
import { ValidationMessage } from '@absoluteui/components/validation-message';
import { Form, type FormSubmitDetail } from '@absoluteui/components/form';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'America/New_York' });
startThemeRuntime();

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`missing #${id}`);
  return el;
}
const host = (id: string): HTMLDivElement => byId(id, HTMLDivElement);

TextInput.create(host('f-email'), { label: 'Email', name: 'email', type: 'email', required: true, autocomplete: 'email', description: 'We never share your email.' });
TextInput.create(host('f-password'), { label: 'Password', name: 'password', type: 'password', required: true, minLength: 8, autocomplete: 'new-password' });
TextInput.create(host('f-confirm'), { label: 'Confirm password', name: 'confirm', type: 'password', required: true, autocomplete: 'new-password' });
TextInput.create(host('f-username'), { label: 'Username', name: 'username', required: true, maxLength: 16, showCounter: true, prefix: '@' });
Textarea.create(host('f-bio'), { label: 'About you', name: 'bio', maxLength: 200, showCounter: true, resize: 'auto' });
NumberInput.create(host('f-age'), { label: 'Age', name: 'age', min: 18, max: 120, required: true });
NumberInput.create(host('f-budget'), { label: 'Monthly budget', name: 'budget', min: 0, step: 0.01, format: { style: 'currency', currency: 'USD' } });
Select.create(host('f-role'), {
  label: 'Role',
  name: 'role',
  required: true,
  options: [
    { value: 'dev', label: 'Developer' },
    { value: 'design', label: 'Designer' },
    { value: 'pm', label: 'Product manager' },
    { value: 'legacy', label: 'Legacy role', disabled: true },
  ],
});
Combobox.create(host('f-country'), {
  label: 'Country',
  name: 'country',
  required: true,
  options: [
    { value: 'in', label: 'India' },
    { value: 'jp', label: 'Japan' },
    { value: 'de', label: 'Germany' },
    { value: 'us', label: 'United States' },
  ],
});
DateInput.create(host('f-start'), { label: 'Start date', name: 'start', required: true });
RadioGroup.create(host('f-plan'), {
  label: 'Plan',
  name: 'plan',
  required: true,
  orientation: 'horizontal',
  options: [
    { value: 'free', label: 'Free' },
    { value: 'team', label: 'Team' },
    { value: 'enterprise', label: 'Enterprise' },
  ],
});
CheckboxGroup.create(host('f-interests'), {
  label: 'Interests',
  name: 'interests',
  maxSelected: 2,
  options: [
    { value: 'a11y', label: 'Accessibility' },
    { value: 'perf', label: 'Performance' },
    { value: 'sec', label: 'Security' },
  ],
});
FormField.create(host('f-zip'), { label: 'ZIP code', control: byId('zip', HTMLInputElement), description: 'Five digits.' });
Switch.create(host('f-news'), { label: 'Email me product news', name: 'news', checked: true });
Checkbox.create(host('f-terms'), { label: 'I accept the terms', name: 'terms', required: true });
Button.enhance(byId('submit', HTMLButtonElement), { variant: 'primary' });
Button.enhance(byId('reset', HTMLButtonElement), { variant: 'ghost' });

const form = Form.create(byId('signup', HTMLFormElement), {
  rules: [{ fields: ['password', 'confirm'], validate: (v) => (v.password === v.confirm ? null : 'Passwords do not match.') }],
  // Simulated server check: resolves after a short delay, honouring cancellation.
  validate: (values, signal) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        resolve(values.username === 'admin' ? { username: 'This username is taken.' } : {});
      }, 50);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      });
    }),
});
form.element.addEventListener('aui-submit', (e) => {
  byId('form-result', HTMLOutputElement).textContent = JSON.stringify((e as CustomEvent<FormSubmitDetail>).detail.values);
});

ValidationMessage.create(host('vm'), { for: byId('vm-target', HTMLInputElement), message: 'Standalone message for a custom control.', tone: 'warning' });

// Exposed for the performance spec only (harness code, not library API).
Object.assign(window, { __auiReady: true, __aui: { TextInput, Textarea, NumberInput, Select, Checkbox, CheckboxGroup, MultiSelect, RadioGroup, Switch, Form } });
