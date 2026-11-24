import { ToggleGroup, type ToggleGroupOptions } from '@absoluteui/components/toggle-group';
import { host, seed } from '../seed.js';

export default seed<ToggleGroupOptions>({
  options: {
    label: 'Working days',
    items: [
      { value: 'mon', label: 'Mon' },
      { value: 'tue', label: 'Tue' },
      { value: 'wed', label: 'Wed' },
      { value: 'thu', label: 'Thu' },
      { value: 'fri', label: 'Fri' },
      { value: 'sat', label: 'Sat' },
      { value: 'sun', label: 'Sun', disabled: true },
    ],
    multiple: true,
    value: ['mon', 'tue', 'wed', 'thu', 'fri'],
    attached: true,
  },
  call: 'ToggleGroup.create(host, $)',
  adjust: (name, value, current) => {
    if (name !== 'multiple') return undefined;
    // `value` is always an array; single mode holds at most one value.
    const list = current.value ?? [];
    return { value: value === true ? list : list.slice(0, 1) };
  },
  mount(stage, options) {
    const h = host(stage);
    const c = ToggleGroup.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
