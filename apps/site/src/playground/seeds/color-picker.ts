import { ColorPicker, type ColorPickerOptions } from '@absoluteui/components/color-picker';
import { host, seed } from '../seed.js';

export default seed<ColorPickerOptions>({
  options: {
    label: 'Brand color',
    value: '#2563eb',
    contrastWith: '#ffffff',
    presets: [
      { value: '#2563eb', label: 'Blue' },
      { value: '#16a34a', label: 'Green' },
      { value: '#dc2626', label: 'Red' },
      { value: '#f59e0b', label: 'Amber' },
    ],
    recent: ['#0f172a'],
  },
  call: 'ColorPicker.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = ColorPicker.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
