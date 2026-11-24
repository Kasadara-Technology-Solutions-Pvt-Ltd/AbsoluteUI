import { Rating, type RatingOptions } from '@absoluteui/components/rating';
import { host, seed } from '../seed.js';

export default seed<RatingOptions>({
  options: { label: 'Overall performance', value: 3.5, allowHalf: true, labels: ['Needs improvement', 'Developing', 'Meets expectations', 'Exceeds expectations', 'Outstanding'] },
  call: 'Rating.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Rating.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
