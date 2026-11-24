import { Slider, type SliderOptions } from '@absoluteui/components/slider';
import { host, seed } from '../seed.js';

export default seed<SliderOptions>({
  options: { label: 'Volume', value: 40, marks: true, step: 10 },
  call: 'Slider.create(host, $)',
  // A range has two values.
  adjust: (name, value) => (name === 'range' ? { value: value === true ? [20, 60] : 40 } : undefined),
  mount(stage, options) {
    const h = host(stage);
    const c = Slider.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
