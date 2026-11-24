// Navigation showcase: an application shell with a collapsible sidebar, a menu bar, breadcrumb,
// tabs, a stepper, pagination, an actions menu, and a context menu, all kept in sync.
import { Breadcrumb } from '@absoluteui/components/breadcrumb';
import { Button } from '@absoluteui/components/button';
import { ContextMenu } from '@absoluteui/components/context-menu';
import { Menu, type MenuItem } from '@absoluteui/components/menu';
import { MenuBar } from '@absoluteui/components/menu-bar';
import { Pagination, type PaginationChangeDetail } from '@absoluteui/components/pagination';
import { Sidebar, type SidebarChangeDetail } from '@absoluteui/components/sidebar';
import { Stepper } from '@absoluteui/components/stepper';
import { Tabs } from '@absoluteui/components/tabs';
import { annotate, choice, createShowcase, hostIn, section, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Application shell',
  description: 'Choose a page in the sidebar, open menus with the keyboard, switch tabs, step through onboarding, and page through results.',
});

// The shell (sidebar, menu bar, breadcrumb, actions menu, tabs); the directory and the stepper
// follow in their own sections, so each component's focus view stays small.
const shell = annotate(hostIn(sc.stage), ['sidebar', 'menu-bar', 'breadcrumb', 'menu', 'tabs']);
shell.className = 'sc-shell';
const side = hostIn(shell);
side.className = 'sc-shell__side';
const main = hostIn(shell, 'main');
main.className = 'sc-shell__main';

const PAGES: Record<string, string> = { dashboard: 'Dashboard', people: 'People', teams: 'Teams', payroll: 'Payroll', reports: 'Reports', settings: 'Settings' };
const sidebar = Sidebar.create(side, {
  label: 'Main',
  value: 'people',
  collapsible: true,
  expanded: ['org'],
  items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'list-bulleted' },
    { type: 'group', id: 'org', label: 'Organization', icon: 'menu', items: [
      { id: 'people', label: 'People' },
      { id: 'teams', label: 'Teams' },
    ] },
    { id: 'payroll', label: 'Payroll', icon: 'file' },
    { id: 'reports', label: 'Reports', icon: 'filter' },
    { id: 'settings', label: 'Settings', icon: 'more-horizontal', disabled: true },
  ],
});

const bar = MenuBar.create(hostIn(main), {
  label: 'Application',
  items: [
    { id: 'file', label: 'File', items: [{ id: 'new', label: 'New employee' }, { id: 'import', label: 'Import…' }, { type: 'separator' }, { id: 'export', label: 'Export CSV' }] },
    { id: 'view', label: 'View', items: [{ type: 'checkbox', id: 'compact', label: 'Compact rows', checked: false }, { type: 'checkbox', id: 'photos', label: 'Show photos', checked: true }, { type: 'separator' }, { type: 'radio', id: 'sort-name', label: 'Sort by name', group: 'sort', checked: true }, { type: 'radio', id: 'sort-date', label: 'Sort by start date', group: 'sort', checked: false }] },
    { id: 'help', label: 'Help', items: [{ id: 'shortcuts', label: 'Keyboard shortcuts' }, { id: 'about', label: 'About' }] },
  ],
});

const crumbs = Breadcrumb.create(hostIn(main), { items: [{ label: 'Home', href: '#home' }, { label: 'Organization', href: '#org' }, { label: 'People' }] });
const title = document.createElement('h2');
title.className = 'sc-shell__title';
title.textContent = 'People';
main.append(title);

const actionsRow = hostIn(main);
actionsRow.className = 'sc-row';
const trigger = Button.create({ text: 'Actions', icon: 'chevron-down', iconPosition: 'end' }, document);
actionsRow.append(trigger.element);
const actionItems: MenuItem[] = [
  { id: 'invite', label: 'Invite people', icon: 'plus' },
  { id: 'download', label: 'Download list', icon: 'download' },
  { type: 'separator' },
  { type: 'group', label: 'Danger zone', items: [{ id: 'archive', label: 'Archive team', icon: 'trash' }] },
];
Menu.create(trigger.element, { items: actionItems, label: 'Actions' });

const tabs = Tabs.create(hostIn(main), {
  label: 'People views',
  tabs: [
    { id: 'directory', label: 'Directory' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'archived', label: 'Archived', disabled: true },
  ],
  value: 'directory',
});

// Directory: a list with a context menu and pagination.
const people = ['Ada Kowalski', 'Bruno Silva', 'Chen Wei', 'Divya Nair', 'Emeka Obi', 'Farah Haddad', 'Grace Liu', 'Hiro Tanaka', 'Inés García', 'Jonas Berg', 'Kofi Mensah', 'Lena Novak', 'Mateo Rossi', 'Nora Lind', 'Omar Aziz', 'Priya Shah', 'Quinn Moore', 'Rosa Diaz', 'Sami Kallio', 'Tomas Weber', 'Uma Rao', 'Victor Hugo', 'Wen Li'];
const pageSize = 5;
const directoryText = document.createElement('p');
directoryText.textContent = `${String(people.length)} people in Organization.`;
tabs.panel('directory')?.append(directoryText);
const directory = section(sc, 'People directory', ['pagination', 'context-menu']);
const list = document.createElement('ul');
list.className = 'sc-people';
list.tabIndex = 0;
list.setAttribute('aria-label', 'People on this page. Press Shift+F10 or the context menu key for actions.');
directory.append(list);
const pager = Pagination.create(hostIn(directory), { page: 1, total: people.length, pageSize, pageSizes: [5, 10], showSummary: true, showFirstLast: true });
let size = pageSize;
const renderPage = (page: number): void => {
  list.replaceChildren(
    ...people.slice((page - 1) * size, page * size).map((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      return li;
    }),
  );
};
renderPage(1);
pager.host.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<PaginationChangeDetail>).detail;
  size = d.pageSize ?? size;
  renderPage(d.page);
});
ContextMenu.create(list, {
  label: 'Person actions',
  items: [
    { id: 'open', label: 'Open profile' },
    { id: 'message', label: 'Send message' },
    { type: 'separator' },
    { type: 'checkbox', id: 'favorite', label: 'Favorite', checked: false },
  ],
});

// Onboarding: a stepper.
const onboardingText = document.createElement('p');
onboardingText.textContent = 'Onboarding: one of four steps complete.';
tabs.panel('onboarding')?.append(onboardingText);
const onboarding = section(sc, 'Onboarding', ['stepper']);
const stepper = Stepper.create(hostIn(onboarding), {
  label: 'Onboarding',
  linear: true,
  value: 'details',
  steps: [
    { id: 'account', label: 'Account', description: 'Email and sign-in', status: 'complete' },
    { id: 'details', label: 'Details', description: 'Role and team' },
    { id: 'documents', label: 'Documents', description: 'Contract and ID' },
    { id: 'review', label: 'Review' },
  ],
});

sidebar.host.addEventListener('aui-change', (e) => {
  const value = (e as CustomEvent<SidebarChangeDetail>).detail.value;
  const label = PAGES[value] ?? value;
  title.textContent = label;
  crumbs.update({ items: [{ label: 'Home', href: '#home' }, ...(value === 'people' || value === 'teams' ? [{ label: 'Organization', href: '#org' }] : []), { label }] });
});
sc.listen(sidebar.host, ['aui-change', 'aui-collapsed-change', 'aui-expanded-change'], 'sidebar');
sc.listen(bar.host, ['aui-select'], 'menu bar');
sc.listen(trigger.element, ['aui-select'], 'actions menu');
sc.listen(list, ['aui-select'], 'context menu');
sc.listen(tabs.host, ['aui-change'], 'tabs');
sc.listen(stepper.host, ['aui-change'], 'stepper');
sc.listen(pager.host, ['aui-change'], 'pagination');
sc.listen(crumbs.host, ['aui-navigate'], 'breadcrumb');
crumbs.host.addEventListener('click', (e) => {
  if (e.target instanceof HTMLAnchorElement) e.preventDefault();
});

toggle(sc, 'Sidebar collapsed', false, (collapsed) => {
  sidebar.update({ collapsed });
}, ['sidebar']);
toggle(sc, 'Linear stepper', true, (linear) => {
  stepper.update({ linear });
}, ['stepper']);
choice(
  sc,
  'Tabs activate',
  [
    { value: 'automatic', label: 'On focus' },
    { value: 'manual', label: 'On Enter or Space' },
  ],
  'automatic',
  (activation) => {
    tabs.update({ activation });
  },
  ['tabs'],
);
