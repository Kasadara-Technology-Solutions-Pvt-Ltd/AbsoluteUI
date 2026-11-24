// R3 organization chart page (SPEC section 18.19), bundled against the built packages.
// ?edit=1 edit mode; ?orientation=horizontal; ?lazy=1 loads the Operations team on demand.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { layoutOrgChart, OrgChart, type OrgChartNode } from '@absoluteui/components/org-chart';
import { orgChartToSvg } from '@absoluteui/components/org-chart-export';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', locale: 'en-US', direction });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const lazy = params.get('lazy') === '1';
const nodes: OrgChartNode[] = [
  { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'Chief Executive Officer' },
  { id: 'cto', parentId: 'ceo', label: 'Grace Hopper', title: 'Chief Technology Officer' },
  { id: 'cfo', parentId: 'ceo', label: 'Mary Jackson', title: 'Chief Financial Officer' },
  { id: 'coo', parentId: 'ceo', label: 'Dorothy Vaughan', title: 'Chief Operating Officer', ...(lazy ? { hasChildren: true } : {}) },
  { id: 'eng', parentId: 'cto', label: 'Margaret Hamilton', title: 'Engineering Lead', description: 'Boston' },
  { id: 'res', parentId: 'cto', label: 'Radia Perlman', title: 'Research Lead', description: 'Seattle' },
  { id: 'dev1', parentId: 'eng', label: 'Linus Torvalds', title: 'Engineer' },
  { id: 'dev2', parentId: 'eng', label: 'Barbara Liskov', title: 'Engineer' },
  { id: 'acc', parentId: 'cfo', label: 'Katherine Johnson', title: 'Controller', locked: true },
  { id: 'tax', parentId: 'cfo', label: 'Evelyn Boyd', title: 'Tax Manager' },
];
const operations: OrgChartNode[] = [
  { id: 'ops1', parentId: 'coo', label: 'Hedy Lamarr', title: 'Logistics' },
  { id: 'ops2', parentId: 'coo', label: 'Annie Easley', title: 'Facilities' },
];
if (!lazy) nodes.push(...operations);

const last = byId('last-event');
const log = (text: string): void => {
  last.textContent = text;
};

const host = byId('org');
const chart = OrgChart.create(host, {
  label: 'Company structure',
  nodes,
  editable: params.get('edit') === '1',
  orientation: params.get('orientation') === 'horizontal' ? 'horizontal' : 'vertical',
  expandDepth: 2,
  loadChildren: (node, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      resolve(node.id === 'coo' ? operations : []);
    }, 50);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    }, { once: true });
  }),
});
host.addEventListener('aui-node-select', (e) => {
  log(`select ${(e as CustomEvent<{ id: string }>).detail.id}`);
});
host.addEventListener('aui-node-move', (e) => {
  const d = (e as CustomEvent<{ reason: string; id: string; parentId: string | null }>).detail;
  log(`move ${d.reason} ${d.id} ${d.parentId ?? 'root'}`);
});
host.addEventListener('aui-expand-change', (e) => {
  const d = (e as CustomEvent<{ id: string; expanded: boolean }>).detail;
  log(`${d.expanded ? 'expand' : 'collapse'} ${d.id}`);
});
const find = byId('find') as HTMLInputElement;
byId('find-go').addEventListener('click', () => {
  const id = chart.search(find.value)[0];
  if (id) chart.reveal(id, { select: true });
});
byId('export').addEventListener('click', () => {
  log(`svg ${String(orgChartToSvg(chart).length)}`);
});

Object.assign(window, { __auiReady: true, __aui: { OrgChart, layoutOrgChart, chart } });
