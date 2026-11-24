// Sortable list showcase: quarterly priorities reordered by pointer drag or keyboard (Space to
// grab, arrows to move, Space to drop, Escape to cancel), with the resulting order shown live.
import { SortableList, type SortableListChangeDetail } from '@absoluteui/components/sortable-list';
import { action, choice, createShowcase, hostIn, section, status, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Quarterly priorities',
  description: 'Reorder priorities by dragging, or with the keyboard: focus a handle, press Space, move with the arrow keys, and press Space again.',
});

const ITEMS = [
  { id: 'hiring', label: 'Hire two platform engineers' },
  { id: 'sso', label: 'Single sign-on for all tools' },
  { id: 'cost', label: 'Cut cloud cost by 15 %' },
  { id: 'a11y', label: 'Accessibility audit of the portal' },
  { id: 'docs', label: 'Rewrite onboarding docs' },
];

const listSection = section(sc, 'Priorities');
const list = SortableList.create(hostIn(listSection), { label: 'Priorities', items: ITEMS, dragFrom: 'handle' });
const order = status(listSection);
const render = (ids: readonly string[]): void => {
  order.textContent = `Order: ${ids.map((id, i) => `${String(i + 1)}. ${ITEMS.find((it) => it.id === id)?.label ?? id}`).join('; ')}`;
};
let current = ITEMS.map((i) => i.id);
render(current);
list.host.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<SortableListChangeDetail>).detail;
  current = [...d.order];
  render(current);
  sc.log('list aui-change', { moved: d.id, from: d.from, to: d.to });
});

choice(
  sc,
  'Drag from',
  [
    { value: 'handle', label: 'Handle only' },
    { value: 'item', label: 'Whole item' },
  ],
  'handle',
  (dragFrom) => {
    list.update({ dragFrom });
  },
);
toggle(sc, 'Disabled', false, (disabled) => {
  list.update({ disabled });
});
action(sc, 'Move first to bottom', () => {
  // Programmatic moves emit no event (the caller already knows the result).
  const id = current[0];
  if (id === undefined) return;
  list.move(id, current.length - 1);
  current = [...current.slice(1), id];
  render(current);
  sc.log('moved by the app', { id });
});
