// Org chart showcase: an organization with teams loaded on demand from a simulated server,
// search, zoom and fit, editing by moving people (with undo), and SVG or PNG export.
import { Button } from '@absoluteui/components/button';
import { OrgChart, type OrgChartNode } from '@absoluteui/components/org-chart';
import { downloadOrgChart } from '@absoluteui/components/org-chart-export';
import { TextInput } from '@absoluteui/components/text-input';
import { action, choice, createShowcase, hostIn, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Organization',
  description: 'Expand divisions (teams load from a simulated server), search for a person, zoom, edit by moving people, and export.',
  simulated: true,
});

const TOP: OrgChartNode[] = [
  { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'Chief Executive' },
  { id: 'cto', parentId: 'ceo', label: 'Chen Wei', title: 'Chief Technology Officer', hasChildren: true },
  { id: 'cfo', parentId: 'ceo', label: 'Farah Haddad', title: 'Chief Financial Officer', hasChildren: true },
  { id: 'coo', parentId: 'ceo', label: 'Bruno Silva', title: 'Chief Operating Officer', hasChildren: true },
];
const TEAMS: Record<string, OrgChartNode[]> = {
  cto: [
    { id: 'platform', parentId: 'cto', label: 'Divya Nair', title: 'Head of Platform' },
    { id: 'web', parentId: 'cto', label: 'Emeka Obi', title: 'Head of Web' },
    { id: 'data', parentId: 'cto', label: 'Grace Liu', title: 'Head of Data' },
  ],
  cfo: [
    { id: 'accounts', parentId: 'cfo', label: 'Hiro Tanaka', title: 'Controller' },
    { id: 'tax', parentId: 'cfo', label: 'Inés García', title: 'Head of Tax' },
  ],
  coo: [
    { id: 'people', parentId: 'coo', label: 'Jonas Berg', title: 'Head of People' },
    { id: 'facilities', parentId: 'coo', label: 'Kofi Mensah', title: 'Facilities Lead' },
  ],
};

const searchRow = hostIn(sc.stage);
searchRow.className = 'sc-row';
const search = TextInput.create(hostIn(searchRow), { label: 'Find a person', type: 'search', placeholder: 'Name or title' });
const go = Button.create({ text: 'Find', variant: 'secondary' }, document);
searchRow.append(go.element);

const host = hostIn(sc.stage);
host.style.setProperty('block-size', '460px');
const chart = OrgChart.create(host, {
  label: 'Organization',
  nodes: TOP,
  expandDepth: 1,
  orientation: 'vertical',
  editable: false,
  loadChildren: async (node, signal) => {
    await wait(500, signal);
    return TEAMS[node.id] ?? [];
  },
});

const find = (): void => {
  const first = chart.search(search.input.value)[0];
  if (first) chart.reveal(first, { select: true });
  sc.log('search', { query: search.input.value, found: first ?? null });
};
go.element.addEventListener('click', find);
search.input.addEventListener('change', find);
sc.listen(host, ['aui-node-select', 'aui-expand-change', 'aui-node-move', 'aui-load-error'], 'chart');

choice(
  sc,
  'Orientation',
  [
    { value: 'vertical', label: 'Top to bottom' },
    { value: 'horizontal', label: 'Left to right' },
  ],
  'vertical',
  (orientation) => {
    chart.update({ orientation });
  },
);
toggle(sc, 'Editable (move people)', false, (editable) => {
  chart.update({ editable });
});
action(sc, 'Fit', () => {
  chart.fit();
});
action(sc, 'Undo move', () => {
  chart.undo();
});
action(sc, 'Export SVG', () => {
  void downloadOrgChart(chart, { format: 'svg', fileName: 'organization.svg' });
});
action(sc, 'Export PNG', () => {
  void downloadOrgChart(chart, { format: 'png', fileName: 'organization.png' });
});
