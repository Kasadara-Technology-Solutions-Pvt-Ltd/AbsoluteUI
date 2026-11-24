// Workspace layout showcase: a splitter with a virtual list of 10,000 employees in the
// sidebar and the selected person's details beside it. Empty states appear when nothing is
// selected and when the department filter matches nobody.
import { EmptyState } from '@absoluteui/components/empty-state';
import { Splitter, type SplitterChangeDetail } from '@absoluteui/components/splitter';
import { VirtualList, type VirtualListChangeDetail, type VirtualListRangeChangeDetail } from '@absoluteui/components/virtual-list';
import { action, choice, createShowcase, section, status, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Workspace layout',
  description: 'Resize or collapse the sidebar, scroll and select among 10,000 employees with the mouse or keyboard (arrows, Home, End, type-ahead), and filter to see the empty states.',
});

interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  location: string;
}

const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Edsger', 'Barbara', 'Donald', 'Margaret', 'Tim', 'Radia', 'Linus', 'Frances'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Dijkstra', 'Liskov', 'Knuth', 'Hamilton', 'Berners-Lee', 'Perlman', 'Torvalds', 'Allen'];
const DEPARTMENTS = ['Engineering', 'Finance', 'Marketing', 'People', 'Sales'];
const TITLES = ['Analyst', 'Engineer', 'Manager', 'Specialist', 'Lead'];
const LOCATIONS = ['Berlin', 'Chennai', 'London', 'New York', 'Sydney'];
const pick = (list: readonly string[], i: number): string => list[i % list.length] ?? '';

const EMPLOYEES: Employee[] = Array.from({ length: 10_000 }, (_, i) => ({
  id: `E${String(i + 1).padStart(5, '0')}`,
  name: `${pick(LAST, Math.floor(i / FIRST.length))}, ${pick(FIRST, i)}`,
  title: pick(TITLES, i * 7),
  department: pick(DEPARTMENTS, i * 3),
  location: pick(LOCATIONS, i * 11),
})).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

function row(e: Employee): Node {
  const el = document.createElement('div');
  el.className = 'sc-person';
  const name = document.createElement('span');
  name.className = 'sc-person__name';
  name.textContent = e.name;
  const meta = document.createElement('span');
  meta.className = 'sc-person__meta';
  meta.textContent = `${e.title}, ${e.department}`;
  el.append(name, meta);
  return el;
}

const area = section(sc, 'Employees', ['splitter', 'virtual-list', 'empty-state']);
const range = status(area);
const workspace = document.createElement('div');
workspace.className = 'sc-workspace';
area.append(workspace);

// The list's own empty content: shown when the filter matches nobody.
const noMatchHost = document.createElement('div');
const noMatch = EmptyState.create(noMatchHost, {
  title: 'No employees in this department',
  description: 'Choose another department or show everyone.',
  icon: 'search',
  size: 'sm',
  headingLevel: null,
  live: true,
  primaryAction: { label: 'Show all departments' },
});

const listHost = document.createElement('div');
listHost.className = 'sc-workspace__list';
let visible = EMPLOYEES;
const list = VirtualList.create<Employee>(listHost, {
  label: 'Employees',
  items: visible,
  height: null,
  selection: 'single',
  itemKey: (e) => e.id,
  itemText: (e) => e.name,
  itemHeight: 56,
  empty: noMatchHost,
  renderItem: row,
});

const detail = document.createElement('div');
detail.className = 'sc-workspace__detail';
const emptyHost = document.createElement('div');
const nothingSelected = EmptyState.create(emptyHost, {
  title: 'No employee selected',
  description: 'Select someone in the list to see their details.',
  icon: 'search',
  headingLevel: 3,
});
const card = document.createElement('section');
card.className = 'sc-workspace__card';
card.hidden = true;
detail.append(emptyHost, card);

const splitter = Splitter.create(workspace, {
  panes: [
    { content: listHost, label: 'Employees', size: '38%', min: 200, max: '70%', collapsible: true },
    { content: detail, label: 'Details', min: 240 },
  ],
});
sc.listen(splitter.host, ['aui-change'], 'splitter');

const byId = new Map(EMPLOYEES.map((e) => [e.id, e]));
function showDetails(keys: readonly string[]): void {
  const people = keys.map((k) => byId.get(k)).filter((e): e is Employee => e !== undefined);
  emptyHost.hidden = people.length > 0;
  card.hidden = people.length === 0;
  if (people.length === 0) return;
  const [first] = people;
  if (people.length > 1 || !first) {
    const h = document.createElement('h3');
    h.textContent = `${String(people.length)} employees selected`;
    const p = document.createElement('p');
    p.textContent = people.slice(0, 5).map((e) => e.name).join('; ') + (people.length > 5 ? '; ...' : '');
    card.replaceChildren(h, p);
    return;
  }
  const h = document.createElement('h3');
  h.textContent = first.name;
  const dl = document.createElement('dl');
  for (const [term, value] of [['Employee ID', first.id], ['Title', first.title], ['Department', first.department], ['Location', first.location]] as const) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  card.replaceChildren(h, dl);
}

list.host.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<VirtualListChangeDetail>).detail;
  showDetails(d.value);
  sc.log('list aui-change', d);
});
const showRange = (start: number, end: number): void => {
  range.textContent = visible.length === 0 ? 'No employees shown.' : `Showing ${String(start + 1)} to ${String(end)} of ${visible.length.toLocaleString('en-US')} employees.`;
};
showRange(list.range.start, list.range.end);
list.host.addEventListener('aui-range-change', (e) => {
  const d = (e as CustomEvent<VirtualListRangeChangeDetail>).detail;
  showRange(d.start, d.end);
});
splitter.host.addEventListener('aui-change', (e) => {
  // Change events of the components inside the panes bubble through the splitter too.
  if (e.target !== splitter.host) return;
  const d = (e as CustomEvent<SplitterChangeDetail>).detail;
  range.dataset.sizes = d.sizes.join(',');
});

const filterBy = (value: string): void => {
  visible = value === 'all' ? EMPLOYEES : EMPLOYEES.filter((e) => e.department === value);
  list.update({ items: visible });
  list.scrollToIndex(0, 'start');
  showRange(list.range.start, list.range.end);
};
const departmentChoice = choice(
  sc,
  'Department',
  [
    { value: 'all', label: 'All departments' },
    ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
    { value: 'Legal', label: 'Legal (no one)' },
  ],
  'all',
  filterBy,
  ['virtual-list', 'empty-state'],
);
noMatchHost.addEventListener('aui-action', () => {
  departmentChoice.setValue('all');
  filterBy('all');
  sc.log('empty-state aui-action', { action: 'primary' });
});

toggle(sc, 'Multiple selection', false, (multiple) => {
  list.update({ selection: multiple ? 'multiple' : 'single', value: [] });
  showDetails([]);
}, ['virtual-list']);
toggle(sc, 'Selection follows focus', false, (selectionFollowsFocus) => {
  list.update({ selectionFollowsFocus });
}, ['virtual-list']);
choice(
  sc,
  'Layout',
  [
    { value: 'horizontal', label: 'Side by side' },
    { value: 'vertical', label: 'Stacked' },
  ],
  'horizontal',
  (orientation) => {
    splitter.update({ orientation });
  },
  ['splitter'],
);
action(sc, 'Collapse or restore sidebar', () => {
  if (splitter.collapsed[0]) splitter.expand(0);
  else splitter.collapse(0);
}, ['splitter']);
action(sc, 'Jump to the middle', () => {
  list.scrollToIndex(Math.floor(visible.length / 2), 'center');
}, ['virtual-list']);
action(sc, 'Clear selection', () => {
  list.setValue([]);
  showDetails([]);
}, ['virtual-list']);
toggle(sc, 'Compact empty states', false, (compact) => {
  nothingSelected.update({ size: compact ? 'sm' : 'md' });
  noMatch.update({ size: compact ? 'sm' : 'md' });
}, ['empty-state']);
