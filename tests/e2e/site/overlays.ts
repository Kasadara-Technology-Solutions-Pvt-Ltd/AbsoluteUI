// R1 overlays and navigation page, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { Dialog } from '@absoluteui/components/dialog';
import { Combobox } from '@absoluteui/components/combobox';
import { Popover } from '@absoluteui/components/popover';
import { Tooltip } from '@absoluteui/components/tooltip';
import { Menu, type MenuSelectDetail } from '@absoluteui/components/menu';
import { Drawer } from '@absoluteui/components/drawer';
import { Tabs } from '@absoluteui/components/tabs';
import { Breadcrumb } from '@absoluteui/components/breadcrumb';
import { Pagination } from '@absoluteui/components/pagination';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', direction: params.get('dir') === 'rtl' ? 'rtl' : 'ltr' });
startThemeRuntime({ applyDirection: true });

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`missing #${id}`);
  return el;
}
const result = byId('last-action', HTMLOutputElement);

Breadcrumb.create(byId('breadcrumb', HTMLDivElement), {
  items: [{ label: 'Home', href: '/' }, { label: 'Projects', href: '/projects' }, { label: 'Harness' }],
});

for (const id of ['popover-trigger', 'menu-trigger', 'drawer-trigger', 'dialog-trigger']) Button.enhance(byId(id, HTMLButtonElement));
Button.enhance(byId('tooltip-trigger', HTMLButtonElement), { icon: 'info', label: 'Help' });

const filters = document.createElement('div');
const status = document.createElement('button');
status.type = 'button';
status.textContent = 'Only active';
filters.append(status);
Popover.create(byId('popover-trigger', HTMLButtonElement), { title: 'Filters', content: filters });

Tooltip.create(byId('tooltip-trigger', HTMLButtonElement), { content: 'Opens the help center', showDelay: 0 });

const menuTrigger = byId('menu-trigger', HTMLButtonElement);
Menu.create(menuTrigger, {
  items: [
    { id: 'edit', label: 'Edit', shortcut: 'E' },
    { id: 'share', label: 'Share', items: [{ id: 'email', label: 'Email' }, { id: 'link', label: 'Copy link' }] },
    { type: 'separator' },
    { type: 'checkbox', id: 'pin', label: 'Pinned', checked: false },
    { id: 'archive', label: 'Archive', disabled: true },
    { id: 'delete', label: 'Delete', tone: 'danger' },
  ],
});
menuTrigger.addEventListener('aui-select', (e) => {
  result.textContent = (e as CustomEvent<MenuSelectDetail>).detail.id;
});

const drawer = Drawer.create({
  title: 'Project details',
  description: 'Edit the project settings.',
  content: 'Drawer body content.',
  actions: [{ label: 'Cancel', value: 'cancel', autofocus: true }, { label: 'Save', value: 'save', variant: 'primary' }],
});
byId('drawer-trigger', HTMLButtonElement).addEventListener('click', () => {
  drawer.open();
});

const dialog = Dialog.create({ title: 'Nested overlays', actions: [{ label: 'Done', value: 'done', autofocus: true }] });
const inner = document.createElement('div');
dialog.body.append(inner);
Combobox.create(inner, { label: 'Owner', options: [{ value: 'a', label: 'Ada' }, { value: 'g', label: 'Grace' }] });
byId('dialog-trigger', HTMLButtonElement).addEventListener('click', () => {
  dialog.open();
});

Tabs.create(byId('tabs', HTMLDivElement), {
  label: 'Project sections',
  tabs: [
    { id: 'overview', label: 'Overview', content: 'Overview panel.' },
    { id: 'activity', label: 'Activity', content: 'Activity panel.' },
    { id: 'settings', label: 'Settings', content: 'Settings panel.' },
    { id: 'legacy', label: 'Legacy', disabled: true, content: 'Legacy panel.' },
  ],
});

Pagination.create(byId('pagination', HTMLDivElement), { page: 3, total: 237, pageSize: 10, pageSizes: [10, 25, 50] });

Object.assign(window, { __auiReady: true });
