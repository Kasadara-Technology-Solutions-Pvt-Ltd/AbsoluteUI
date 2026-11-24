import { Stepper, type StepperOptions } from '@absoluteui/components/stepper';
import { host, seed } from '../seed.js';

export default seed<StepperOptions>({
  options: {
    label: 'New hire onboarding',
    value: 'equipment',
    steps: [
      { id: 'details', label: 'Personal details', status: 'complete' },
      { id: 'contract', label: 'Contract', description: 'Signed on 3 November', status: 'complete' },
      { id: 'equipment', label: 'Equipment' },
      { id: 'training', label: 'Training', optional: true },
      { id: 'review', label: 'Review' },
    ],
  },
  call: 'Stepper.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Stepper.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
