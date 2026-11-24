import { duration } from '@absoluteui/core';
import { DurationPicker, type DurationPickerOptions } from '@absoluteui/components/duration-picker';
import { host, seed } from '../seed.js';

export default seed<DurationPickerOptions>({
  options: {
    label: 'Time worked',
    description: 'In 15-minute steps, at most one working day.',
    value: duration(150 * 60_000),
    max: duration(8 * 3_600_000),
    step: duration(15 * 60_000),
    fields: ['hours', 'minutes'],
    name: 'timeWorked',
    required: true,
  },
  codeValues: {
    value: 'duration(150 * 60_000)',
    max: 'duration(8 * 3_600_000)',
    step: 'duration(15 * 60_000)',
  },
  call: 'DurationPicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = DurationPicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
