// R2 navigation and overlays page, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { MenuBar, type MenuBarSelectDetail } from '@absoluteui/components/menu-bar';
import { ContextMenu, type ContextMenuSelectDetail } from '@absoluteui/components/context-menu';
import { Stepper, type StepperChangeDetail } from '@absoluteui/components/stepper';
import { Sidebar, type SidebarModeChangeDetail } from '@absoluteui/components/sidebar';
import { HoverCard } from '@absoluteui/components/hover-card';
import { BottomSheet } from '@absoluteui/components/bottom-sheet';
import { SortableList, type SortableListChangeDetail } from '@absoluteui/components/sortable-list';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', direction: params.get('dir') === 'rtl' ? 'rtl' : 'ltr' });
startThemeRuntime({ applyDirection: true });

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`missing #${id}`);
  return el;
}
const result = byId('last-action', HTMLOutputElement);

const sidebar = Sidebar.create(byId('sidebar', HTMLElement), {
  label: 'Main',
  value: 'overview',
  items: [
    { id: 'overview', label: 'Overview', href: '#overview', icon: 'menu' },
    {
      type: 'group',
      id: 'reports',
      label: 'Reports',
      icon: 'calendar',
      items: [
        { id: 'sales', label: 'Sales', href: '#sales' },
        { id: 'usage', label: 'Usage', href: '#usage' },
      ],
    },
    { id: 'search', label: 'Search', href: '#search', icon: 'search' },
    { id: 'settings', label: 'Settings', icon: 'info' },
    { id: 'billing', label: 'Billing', href: '#billing', disabled: true },
  ],
});
// The harness is a single page: sidebar links do not navigate.
sidebar.host.addEventListener('aui-navigate', (e) => {
  e.preventDefault();
  const { id } = (e as CustomEvent<{ id: string }>).detail;
  sidebar.select(id);
  sidebar.close();
  result.textContent = id;
});
const navToggle = byId('nav-toggle', HTMLButtonElement);
Button.enhance(navToggle, { variant: 'secondary' });
// Author display rules (.demo-row, .aui-button) beat the hidden attribute: hide through the CSSOM.
const syncToggle = (): void => {
  const row = navToggle.parentElement;
  if (sidebar.mode === 'drawer') row?.style.removeProperty('display');
  else row?.style.setProperty('display', 'none');
};
syncToggle();
sidebar.host.addEventListener('aui-mode-change', (e) => {
  if ((e as CustomEvent<SidebarModeChangeDetail>).detail.mode === 'inline') sidebar.close();
  syncToggle();
});
navToggle.addEventListener('click', () => {
  sidebar.open();
});

const menubar = MenuBar.create(byId('menubar', HTMLDivElement), {
  label: 'Editor',
  items: [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New', shortcut: 'Ctrl+N' },
        { id: 'open', label: 'Open', items: [{ id: 'recent-1', label: 'report.pdf' }, { id: 'recent-2', label: 'budget.xlsx' }] },
        { type: 'separator' },
        { id: 'save', label: 'Save' },
      ],
    },
    { id: 'edit', label: 'Edit', items: [{ id: 'undo', label: 'Undo' }, { id: 'redo', label: 'Redo', disabled: true }] },
    { id: 'view', label: 'View', items: [{ type: 'checkbox', id: 'grid', label: 'Show grid', checked: true }] },
    { id: 'help', label: 'Help' },
  ],
});
menubar.host.addEventListener('aui-select', (e) => {
  result.textContent = (e as CustomEvent<MenuBarSelectDetail>).detail.id;
});

const stepper = Stepper.create(byId('stepper', HTMLDivElement), {
  label: 'Checkout progress',
  value: 'shipping',
  steps: [
    { id: 'cart', label: 'Cart', status: 'complete' },
    { id: 'shipping', label: 'Shipping', description: 'Address and method' },
    { id: 'gift', label: 'Gift options', optional: true },
    { id: 'payment', label: 'Payment' },
  ],
});
stepper.host.addEventListener('aui-change', (e) => {
  byId('current-step', HTMLOutputElement).textContent = (e as CustomEvent<StepperChangeDetail>).detail.value;
});

const files = byId('files', HTMLDivElement);
for (const b of files.querySelectorAll('button')) Button.enhance(b, { variant: 'ghost' });
ContextMenu.create(files, {
  label: 'File actions',
  items: [
    { id: 'open-file', label: 'Open' },
    { id: 'share-file', label: 'Share', items: [{ id: 'share-email', label: 'Email' }, { id: 'share-link', label: 'Copy link' }] },
    { type: 'separator' },
    { id: 'delete-file', label: 'Delete', tone: 'danger' },
  ],
});
files.addEventListener('aui-select', (e) => {
  const { id, origin } = (e as CustomEvent<ContextMenuSelectDetail>).detail;
  result.textContent = `${id}:${origin.textContent}`;
});

const card = document.createElement('div');
const bio = document.createElement('p');
bio.textContent = 'Mathematician and writer, known for the first published algorithm.';
const profile = document.createElement('a');
profile.href = '#profile';
profile.textContent = 'View profile';
card.append(bio, profile);
HoverCard.create(byId('author', HTMLAnchorElement), { content: card, showDelay: 0, hideDelay: 100 });

const sheetBody = document.createElement('div');
const sheetText = document.createElement('p');
sheetText.textContent = 'Send this report to your team.';
const copy = document.createElement('button');
copy.type = 'button';
copy.textContent = 'Copy link';
Button.enhance(copy, { variant: 'primary' });
sheetBody.append(sheetText, copy);
const sheet = BottomSheet.create({ title: 'Share report', description: 'Choose how to share.', content: sheetBody, snapPoints: [0.4, 0.9] });
const sheetTrigger = byId('sheet-trigger', HTMLButtonElement);
Button.enhance(sheetTrigger);
sheetTrigger.addEventListener('click', () => {
  sheet.open();
});

const sortable = SortableList.create(byId('sortable', HTMLDivElement), {
  label: 'Priorities',
  items: [
    { id: 'security', label: 'Security review' },
    { id: 'search', label: 'Search' },
    { id: 'billing', label: 'Billing' },
    { id: 'exports', label: 'Exports' },
    { id: 'audit', label: 'Audit log', disabled: true },
  ],
});
sortable.host.addEventListener('aui-change', (e) => {
  byId('order', HTMLOutputElement).textContent = (e as CustomEvent<SortableListChangeDetail>).detail.order.join(', ');
});

Object.assign(window, { __auiReady: true, __aui: { Stepper, MenuBar, ContextMenu, Sidebar, HoverCard, BottomSheet, SortableList } });
