// R20 P9 page: Transfer List, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Stack } from '@absoluteui/components/layout';
import { TransferList, type TransferListValueDetail } from '@absoluteui/components/transfer-list';

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

const team = TransferList.create(byId('team'), {
  label: 'Project team',
  name: 'members',
  required: true,
  draggable: true,
  items: [
    { value: 'e1', label: 'Asha Rao', description: 'Engineering' },
    { value: 'e2', label: 'Ben Okafor', description: 'Design' },
    { value: 'e3', label: 'Chen Wei', description: 'Engineering' },
    { value: 'e4', label: 'Dana Silva', description: 'On leave', disabled: true },
    { value: 'e5', label: 'Eve Martin', description: 'Finance' },
  ],
  value: ['e2'],
  titles: { available: 'Employees', selected: 'Team' },
});
team.host.addEventListener('aui-change', (e) => {
  const { value } = (e as CustomEvent<TransferListValueDetail>).detail;
  byId('team-log').textContent = `change: ${value.join(',')}`;
});

TransferList.create(byId('large'), {
  label: 'Featured products',
  maxSelected: 5,
  items: Array.from({ length: 10_000 }, (_, i) => ({ value: `p${String(i)}`, label: `Product ${String(i + 1)}` })),
});

TransferList.create(byId('readonly'), { label: 'Granted permissions', readOnly: true, items: [{ value: 'r', label: 'Read' }, { value: 'w', label: 'Write' }], value: ['r'] });
TransferList.create(byId('disabled'), { label: 'Archived team', disabled: true, items: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }], value: ['b'] });

Object.assign(window, { __auiReady: true });
