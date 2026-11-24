import { Button } from '@absoluteui/components/button';
import { Form, type FormOptions } from '@absoluteui/components/form';
import { TextInput } from '@absoluteui/components/text-input';
import { host, seed } from '../seed.js';

export default seed<FormOptions>({
  options: {
    rules: [
      { fields: ['email', 'confirmEmail'], validate: (v) => (v.email === v.confirmEmail ? null : 'The email addresses do not match.') },
    ],
    summaryTitle: 'Check the new employee details',
    focusOnInvalid: 'summary',
  },
  call: 'Form.create(formElement, $)',
  codeValues: {
    rules: "[{ fields: ['email', 'confirmEmail'], validate: (v) => (v.email === v.confirmEmail ? null : 'The email addresses do not match.') }]",
  },
  // Native submission would navigate the docs frame away.
  hide: ['submitMode'],
  note: 'Press Add employee with empty or mismatched fields to see the error summary; valid values dispatch aui-submit.',
  mount(stage, options) {
    const el = host(stage, 'form');
    el.noValidate = true;
    const fields = [
      TextInput.create(host(el), { label: 'Full name', name: 'fullName', autocomplete: 'name', required: true }),
      TextInput.create(host(el), { label: 'Work email', name: 'email', type: 'email', autocomplete: 'email', required: true }),
      TextInput.create(host(el), { label: 'Confirm work email', name: 'confirmEmail', type: 'email', required: true }),
    ];
    const submit = Button.create({ text: 'Add employee', type: 'submit', variant: 'primary' }, document);
    el.append(submit.element);
    const form = Form.create(el, options);
    return {
      events: el,
      update: (p) => { form.update(p); },
      destroy: () => {
        form.destroy();
        for (const f of fields) f.destroy();
        submit.destroy();
        el.remove();
      },
    };
  },
});
