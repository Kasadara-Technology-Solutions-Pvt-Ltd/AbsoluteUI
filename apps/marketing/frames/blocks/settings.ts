import { Button } from '@absoluteui/components/button';
import { Fieldset } from '@absoluteui/components/fieldset';
import { Form } from '@absoluteui/components/form';
import { Select } from '@absoluteui/components/select';
import { Switch } from '@absoluteui/components/switch';
import { TextInput } from '@absoluteui/components/text-input';

const form = document.querySelector<HTMLFormElement>('#settings');
const profile = document.querySelector<HTMLFieldSetElement>('#profile');
const notifications = document.querySelector<HTMLFieldSetElement>('#notifications');
const actions = document.querySelector<HTMLElement>('#actions');

if (form && profile && notifications && actions) {
  const field = (parent: HTMLElement): HTMLDivElement => {
    const host = document.createElement('div');
    parent.append(host);
    return host;
  };

  Fieldset.enhance(profile, { legend: 'Profile', description: 'Shown to your team.' });
  TextInput.create(field(profile), { label: 'Display name', name: 'name', value: 'Priya Iyer', required: true, autocomplete: 'name' });
  Select.create(field(profile), {
    label: 'Time zone',
    name: 'timezone',
    value: 'Asia/Kolkata',
    options: [
      { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
      { value: 'Europe/London', label: 'United Kingdom (Europe/London)' },
      { value: 'America/New_York', label: 'US Eastern (America/New_York)' },
    ],
  });
  Select.create(field(profile), {
    label: 'Week starts on',
    name: 'weekStart',
    value: 'monday',
    options: [
      { value: 'monday', label: 'Monday' },
      { value: 'sunday', label: 'Sunday' },
    ],
  });

  Fieldset.enhance(notifications, { legend: 'Notifications', description: 'Email and in-app.' });
  Switch.create(field(notifications), { label: 'Weekly summary', name: 'summary', checked: true });
  Switch.create(field(notifications), { label: 'Approval requests', name: 'approvals', checked: true, description: 'When someone asks you to approve a request' });

  actions.append(Button.create({ text: 'Cancel', type: 'reset', variant: 'secondary' }).element, Button.create({ text: 'Save changes', type: 'submit', variant: 'primary' }).element);
  Form.create(form, { focusOnInvalid: 'summary' });
}
