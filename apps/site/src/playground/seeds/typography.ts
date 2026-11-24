import { Link, type LinkOptions } from '@absoluteui/components/typography';
import { seed } from '../seed.js';

/** The playground shows Link.create; the Heading, Text, and setLineClamp options are hidden. */
type LinkSeed = LinkOptions & {
  readonly level?: never;
  readonly size?: never;
  readonly tone?: never;
  readonly strong?: never;
  readonly as?: never;
  readonly lines?: never;
};

export default seed<LinkSeed>({
  options: { href: 'https://example.com/handbook/leave-policy', text: 'Read the leave policy', external: true },
  call: 'const link = Link.create($);\nparagraph.append(link)',
  hide: ['level', 'size', 'tone', 'strong', 'as', 'lines'],
  mount(stage, options) {
    const link = Link.create(options, document);
    stage.append(link);
    return { events: link, destroy: () => { link.remove(); } };
  },
});
