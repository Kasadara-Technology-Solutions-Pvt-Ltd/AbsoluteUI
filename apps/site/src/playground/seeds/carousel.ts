import { Carousel, type CarouselOptions } from '@absoluteui/components/carousel';
import { host, seed } from '../seed.js';

export default seed<CarouselOptions>({
  options: {
    label: 'Onboarding tour',
    slides: [
      { label: 'Welcome', content: 'Welcome to the team. This tour shows the HR portal in four steps.' },
      { label: 'Profile', content: 'Complete your profile: emergency contact, bank details, and tax form.' },
      { label: 'Time off', content: 'Request leave from Time off; your manager approves it in one click.' },
      { label: 'Payslips', content: 'Find your payslips under Pay on the last working day of each month.' },
    ],
    loop: true,
    showPicker: true,
  },
  call: 'Carousel.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Carousel.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
