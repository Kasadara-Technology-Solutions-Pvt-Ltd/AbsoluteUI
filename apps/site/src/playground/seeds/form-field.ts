import { FormField, type FormFieldOptions } from '@absoluteui/components/form-field';
import { host, seed } from '../seed.js';

/** A fresh native control for each mount; the field wraps it in place. */
function employeeIdInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.name = 'employeeId';
  input.pattern = 'EMP-[0-9]{4}';
  input.autocomplete = 'off';
  return input;
}

export default seed<FormFieldOptions>({
  options: {
    label: 'Employee ID',
    control: employeeIdInput(),
    description: 'Format EMP-1234',
    required: true,
    validationTiming: 'blur',
  },
  call: 'FormField.create(host, $)',
  codeValues: { control: "document.querySelector<HTMLInputElement>('input[name=employeeId]')" },
  // The mount creates the native control itself.
  hide: ['control'],
  note: 'Type an ID and leave the field to see the native pattern check with the AbsoluteUI message.',
  mount(stage, options) {
    const h = host(stage);
    const control = employeeIdInput();
    h.append(control);
    const c = FormField.create(h, { ...options, control });
    return {
      events: h,
      // control is hidden, so patches never carry it.
      update: (p) => { c.update(p); },
      destroy: () => { c.destroy(); h.remove(); },
    };
  },
});
