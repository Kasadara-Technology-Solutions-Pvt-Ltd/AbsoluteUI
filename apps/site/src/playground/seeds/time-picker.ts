import { plainTime } from '@absoluteui/core';
import { TimePicker, type TimePickerOptions } from '@absoluteui/components/time-picker';
import { host, seed } from '../seed.js';

export default seed<TimePickerOptions>({
  options: {
    label: 'Shift start',
    description: 'Shifts start between 07:00 and 19:00.',
    value: plainTime(9),
    min: plainTime(7),
    max: plainTime(19),
    step: 15,
    name: 'shiftStart',
    required: true,
  },
  codeValues: {
    value: 'plainTime(9)',
    min: 'plainTime(7)',
    max: 'plainTime(19)',
  },
  call: 'TimePicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = TimePicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
