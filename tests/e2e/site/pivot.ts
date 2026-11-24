// R3 pivot page (SPEC section 18.19), bundled against the built packages.
// ?server=1 serves the same data through an asynchronous data source (lazy groups);
// ?rows=N generates N records; ?virtual=1 renders a virtual body.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { createLocalPivotSource, PivotFieldList, PivotGrid, type PivotDataSource, type PivotField } from '@absoluteui/components/pivot-grid';

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

interface Sale {
  region: string;
  country: string;
  product: string;
  quarter: string;
  customer: string;
  amount: number;
  units: number;
}

const REGIONS: Record<string, string[]> = { Americas: ['Brazil', 'Canada', 'USA'], Europe: ['France', 'Germany', 'Italy'], Asia: ['India', 'Japan'] };
const PRODUCTS = ['Laptop', 'Phone', 'Tablet'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Deterministic records (no Math.random): the same page renders the same pivot. */
function records(n: number): Sale[] {
  const out: Sale[] = [];
  const regions = Object.entries(REGIONS);
  for (let i = 0; i < n; i++) {
    const [region, countries] = regions[i % regions.length] ?? ['Americas', ['USA']];
    out.push({
      region,
      country: countries[Math.floor(i / regions.length) % countries.length] ?? 'USA',
      product: PRODUCTS[(i * 7) % PRODUCTS.length] ?? 'Laptop',
      quarter: QUARTERS[(i * 5 + Math.floor(i / 11)) % QUARTERS.length] ?? 'Q1',
      customer: `C${String(i % 5000).padStart(4, '0')}`,
      amount: ((i * 37) % 900) + 100,
      units: (i % 9) + 1,
    });
  }
  return out;
}

const fields: PivotField<Sale>[] = [
  { id: 'region', label: 'Region' },
  { id: 'country', label: 'Country' },
  { id: 'product', label: 'Product' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'customer', label: 'Customer', areas: ['rows', 'filters'] },
  { id: 'amount', label: 'Amount', numberFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } },
  { id: 'units', label: 'Units', areas: ['values'] },
];

const data = records(Number(params.get('rows') ?? '240'));
const last = byId('last-event');
const layout = { rows: ['region', 'country'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' as const }], filters: ['product'] };

let source: PivotDataSource | null = null;
/** Row parents of every server query, for the lazy-loading test. */
const queries: unknown[] = [];
if (params.get('server') === '1') {
  const local = createLocalPivotSource(data, fields);
  const wait = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    }, { once: true });
  });
  source = {
    query: async (q, signal) => {
      await wait(30, signal);
      queries.push(q.rowParents);
      return local.query(q, signal);
    },
    members: async (r, signal) => {
      await wait(10, signal);
      return local.members(r, signal);
    },
  };
}

const grid = PivotGrid.create<Sale>(byId('pivot'), {
  caption: 'Sales by region and quarter',
  fields,
  ...(source ? { dataSource: source, expandDepth: 0 } : { data }),
  virtual: params.get('virtual') === '1',
  layout,
});
const list = PivotFieldList.create(byId('fields'), { grid, label: 'Pivot fields' });
byId('pivot').addEventListener('aui-layout-change', (e) => {
  last.textContent = `layout ${(e as CustomEvent<{ reason: string }>).detail.reason}`;
});
byId('csv').addEventListener('click', () => {
  last.textContent = grid.toCsv({ lineEnding: '\n' }).split('\n').slice(0, 2).join(' | ');
});

void grid.ready.then(() => {
  Object.assign(window, { __auiReady: true, __aui: { PivotGrid, PivotFieldList, createLocalPivotSource, grid, list, records, fields, queries } });
});
