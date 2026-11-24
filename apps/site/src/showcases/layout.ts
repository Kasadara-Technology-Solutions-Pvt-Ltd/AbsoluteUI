// Layout and content showcase: a team profile page built with the layout primitives, cards,
// typography, badges, keyboard keys, avatars, an avatar group, and a tag group.
import { Avatar } from '@absoluteui/components/avatar';
import { AvatarGroup } from '@absoluteui/components/avatar-group';
import { Badge } from '@absoluteui/components/badge';
import { Card } from '@absoluteui/components/card';
import { Kbd } from '@absoluteui/components/kbd';
import { Container, Divider, Flex, Grid, Stack } from '@absoluteui/components/layout';
import { TagGroup, type TagGroupChangeDetail } from '@absoluteui/components/tag-group';
import { Heading, Link, Text } from '@absoluteui/components/typography';
import { annotate, choice, createShowcase, hostIn, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Team profile',
  description: 'Layout primitives and content components composing a real page. Resize the frame: the grid reflows.',
});

const page = hostIn(sc.stage);
Container.apply(page, { size: 'lg' });
const stack = Stack.apply(page, { gap: 6 });

// Each block of the page declares its components (focus mode shows a component's own blocks).
// Header.
const header = annotate(hostIn(page), ['layout', 'avatar', 'typography', 'badge']);
const headerFlex = Flex.apply(header, { gap: 4, align: 'center', wrap: true });
const avatar = Avatar.create(hostIn(header), { name: 'Platform Engineering', size: 'xl', shape: 'square', icon: 'code' });
const titles = hostIn(header);
Stack.apply(titles, { gap: 1 });
titles.append(Heading.create(2, 'Platform Engineering', { size: 3 }), Text.create('Builds and runs the internal developer platform.', { tone: 'muted' }));
const badges = hostIn(titles);
Flex.apply(badges, { gap: 2, wrap: true });
const badgeList = [
  Badge.create(hostIn(badges), { label: 'Hiring', tone: 'success', dot: true }),
  Badge.create(hostIn(badges), { label: '14 members', tone: 'neutral' }),
  Badge.create(hostIn(badges), { label: 'On call', tone: 'warning', variant: 'outline', icon: 'clock' }),
];

// Members grid of cards.
const members = annotate(hostIn(page), ['layout', 'card', 'avatar', 'typography']);
Stack.apply(members, { gap: 4 });
members.append(Divider.create({ label: 'Members' }));
const grid = hostIn(members);
const gridLayout = Grid.apply(grid, { columns: 'auto', minColumnWidth: '14rem', gap: 4 });
const MEMBERS = [
  { name: 'Ada Kowalski', role: 'Engineering lead', status: 'online' },
  { name: 'Bruno Silva', role: 'Site reliability', status: 'busy' },
  { name: 'Chen Wei', role: 'Backend engineer', status: 'away' },
  { name: 'Divya Nair', role: 'Frontend engineer', status: 'offline' },
] as const;
const cards = MEMBERS.map((m) => {
  const content = document.createElement('div');
  Flex.apply(content, { gap: 3, align: 'center' });
  Avatar.create(hostIn(content), { name: m.name, status: m.status, size: 'md' });
  const who = document.createElement('div');
  who.append(Text.create(m.name, { strong: true }), Text.create(m.role, { tone: 'muted', size: 'sm' }));
  content.append(who);
  return Card.create(hostIn(grid), { content, variant: 'raised', headingLevel: 3 });
});

// Skills and shortcuts.
const details = hostIn(page);
Grid.apply(details, { columns: 'auto', minColumnWidth: '16rem', gap: 4 });
const skillsBody = document.createElement('div');
const tags = TagGroup.create(hostIn(skillsBody), {
  label: 'Team skills',
  removable: true,
  selection: 'multiple',
  value: ['kubernetes'],
  items: [
    { value: 'kubernetes', label: 'Kubernetes' },
    { value: 'terraform', label: 'Terraform' },
    { value: 'go', label: 'Go' },
    { value: 'observability', label: 'Observability' },
    { value: 'security', label: 'Security' },
  ],
});
annotate(Card.create(hostIn(details), { title: 'Skills', content: skillsBody, headingLevel: 3 }).host, ['layout', 'card', 'tag-group']);

const shortcutsBody = document.createElement('dl');
shortcutsBody.className = 'sc-shortcuts';
for (const [keys, text] of [
  ['Mod+K', 'Search'],
  ['Mod+Shift+P', 'Command palette'],
  ['?', 'Show shortcuts'],
] as const) {
  const dt = document.createElement('dt');
  Kbd.create(dt, { hotkey: keys });
  const dd = document.createElement('dd');
  dd.textContent = text;
  shortcutsBody.append(dt, dd);
}
annotate(Card.create(hostIn(details), { title: 'Shortcuts', content: shortcutsBody, headingLevel: 3 }).host, ['layout', 'card', 'kbd']);

const footer = annotate(hostIn(page), ['layout', 'avatar-group', 'typography']);
Flex.apply(footer, { gap: 3, align: 'center', justify: 'between', wrap: true });
const group = AvatarGroup.create(hostIn(footer), { label: 'Recently active', max: 4, items: ['Ada Kowalski', 'Bruno Silva', 'Chen Wei', 'Divya Nair', 'Emeka Obi', 'Farah Haddad', 'Grace Liu'].map((name) => ({ name })) });
footer.append(Link.create({ href: 'https://example.com/platform', text: 'Team handbook', external: true }));

sc.listen(tags.host, ['aui-change', 'aui-remove'], 'tags');
tags.host.addEventListener('aui-change', (e) => {
  sc.log('selected skills', (e as CustomEvent<TagGroupChangeDetail>).detail.value);
});

choice(
  sc,
  'Spacing',
  [
    { value: '4', label: 'Compact' },
    { value: '6', label: 'Comfortable' },
    { value: '10', label: 'Spacious' },
  ],
  '6',
  (g) => {
    const gap = Number(g) as 4 | 6 | 10;
    stack.update({ gap });
    gridLayout.update({ gap: gap === 10 ? 8 : 4 });
    headerFlex.update({ gap: gap === 10 ? 6 : 4 });
  },
  ['layout'],
);
choice(
  sc,
  'Avatar shape',
  [
    { value: 'square', label: 'Square' },
    { value: 'circle', label: 'Circle' },
  ],
  'square',
  (shape) => {
    avatar.update({ shape });
    group.update({ shape });
  },
  ['avatar', 'avatar-group'],
);
toggle(sc, 'Outline badges', false, (outline) => {
  for (const b of badgeList) b.update({ variant: outline ? 'outline' : 'subtle' });
}, ['badge']);
toggle(sc, 'Sunken cards', false, (sunken) => {
  for (const c of cards) c.update({ variant: sunken ? 'sunken' : 'raised' });
}, ['card']);
