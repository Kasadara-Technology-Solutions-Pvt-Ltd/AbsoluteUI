import { Card, type CardOptions } from '@absoluteui/components/card';
import { Text } from '@absoluteui/components/typography';
import { host, seed } from '../seed.js';

/** padded belongs to Surface.apply; the playground shows Card.create. */
type CardSeed = CardOptions & { readonly padded?: never };

export default seed<CardSeed>({
  options: {
    title: 'Annual leave',
    subtitle: 'Ada Lovelace, Engineering',
    content: '18 of 25 days remaining. 3 days pending approval.',
    footer: Text.create('Updated 2 hours ago', { tone: 'muted', size: 'sm' }),
    variant: 'raised',
    headingLevel: 3,
  },
  codeValues: { footer: "Text.create('Updated 2 hours ago', { tone: 'muted', size: 'sm' })" },
  call: 'Card.create(host, $)',
  hide: ['padded'],
  mount(stage, options) {
    const h = host(stage);
    const c = Card.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
