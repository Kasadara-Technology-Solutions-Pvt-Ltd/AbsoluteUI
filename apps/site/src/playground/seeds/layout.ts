import { Card } from '@absoluteui/components/card';
import { Grid, type GridOptions } from '@absoluteui/components/layout';
import { host, seed } from '../seed.js';

/** The playground shows Grid.apply; the other layout helpers' options are hidden. */
type GridSeed = GridOptions & {
  readonly align?: never;
  readonly justify?: never;
  readonly wrap?: never;
  readonly direction?: never;
  readonly size?: never;
  readonly orientation?: never;
  readonly label?: never;
  readonly decorative?: never;
  readonly defaultGap?: never;
};

const TILES: readonly { readonly title: string; readonly content: string }[] = [
  { title: 'Headcount', content: '248 employees across 6 offices.' },
  { title: 'Open roles', content: '12 positions, 4 in final interviews.' },
  { title: 'Leave today', content: '9 people on approved leave.' },
  { title: 'Reviews due', content: '31 performance reviews this month.' },
  { title: 'New joiners', content: '5 people start on Monday.' },
];

export default seed<GridSeed>({
  options: { columns: 'auto', minColumnWidth: '12rem', gap: 4 },
  call: 'Grid.apply(element, $)',
  hide: ['align', 'justify', 'wrap', 'direction', 'size', 'orientation', 'label', 'decorative', 'defaultGap'],
  note: 'Grid.apply lays out the five cards; resize the frame to see auto columns reflow.',
  mount(stage, options) {
    const el = host(stage);
    const cards = TILES.map((t) => Card.create(host(el), { title: t.title, content: t.content, headingLevel: 3 }));
    const grid = Grid.apply(el, options);
    return {
      events: el,
      update: (p) => { grid.update(p); },
      destroy: () => { grid.destroy(); for (const c of cards) c.destroy(); el.remove(); },
    };
  },
});
