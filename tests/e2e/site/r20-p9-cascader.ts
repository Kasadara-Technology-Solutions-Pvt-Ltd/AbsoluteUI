// R20 P9 page: Cascader, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Stack } from '@absoluteui/components/layout';
import { Cascader, type CascaderOption, type CascaderValueDetail } from '@absoluteui/components/cascader';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', direction: params.get('dir') === 'rtl' ? 'rtl' : 'ltr' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const TREE: CascaderOption[] = [
  {
    value: 'in',
    label: 'India',
    children: [
      { value: 'ka', label: 'Karnataka', children: [{ value: 'blr', label: 'Bengaluru' }, { value: 'mys', label: 'Mysuru' }] },
      { value: 'kl', label: 'Kerala', children: [{ value: 'cok', label: 'Kochi' }] },
    ],
  },
  { value: 'de', label: 'Germany', children: [{ value: 'by', label: 'Bavaria', children: [{ value: 'muc', label: 'Munich' }] }] },
];

const location1 = Cascader.create(byId('location'), { label: 'Work location', name: 'city', required: true, levelLabels: ['Country', 'State', 'City'], options: TREE });
location1.host.addEventListener('aui-change', (e) => {
  const { labels } = (e as CustomEvent<CascaderValueDetail>).detail;
  byId('location-log').textContent = `change: ${Array.isArray(labels) ? labels.join(' > ') : 'none'}`;
});

// Simulated server: a short delay; "Fails once" rejects the first time to show the retry path.
let failed = false;
Cascader.create(byId('lazy'), {
  label: 'Department',
  levelLabels: ['Division', 'Team'],
  options: [{ value: 'ops', label: 'Operations' }, { value: 'flaky', label: 'Fails once' }],
  loadChildren: (option, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (option.value === 'flaky' && !failed) {
        failed = true;
        reject(new Error('offline'));
        return;
      }
      resolve([{ value: `${option.value}-1`, label: `${option.label} team A`, isLeaf: true }, { value: `${option.value}-2`, label: `${option.label} team B`, isLeaf: true }]);
    }, 150);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  }),
});

Cascader.create(byId('multiple'), { label: 'Offices', multiple: true, options: TREE, value: [['in', 'ka', 'blr']] });

Object.assign(window, { __auiReady: true });
