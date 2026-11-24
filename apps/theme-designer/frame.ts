// Theme Designer preview frame (SPEC section 10.3): common component states rendered with
// the theme under design. The parent designer posts the exported CSS; the frame applies
// it as a constructable stylesheet (no inline <style>, CSP and Trusted Types safe).
import { addDays, instant, plainDate, type Instant } from '@absoluteui/core';
import { Alert } from '@absoluteui/components/alert';
import { Avatar } from '@absoluteui/components/avatar';
import { AvatarGroup } from '@absoluteui/components/avatar-group';
import { Badge } from '@absoluteui/components/badge';
import { BarChart } from '@absoluteui/components/bar-chart';
import { Button } from '@absoluteui/components/button';
import { CalendarHeatmap } from '@absoluteui/components/calendar-heatmap';
import { CandlestickChart } from '@absoluteui/components/candlestick-chart';
import { Card } from '@absoluteui/components/card';
import { Carousel } from '@absoluteui/components/carousel';
import { Chat } from '@absoluteui/components/chat';
import { Discussion } from '@absoluteui/components/discussion';
import { Cascader } from '@absoluteui/components/cascader';
import { ColorPicker } from '@absoluteui/components/color-picker';
import { NetworkGraph } from '@absoluteui/components/network-graph';
import { Checkbox } from '@absoluteui/components/checkbox';
import { Collapsible } from '@absoluteui/components/collapsible';
import { Combobox } from '@absoluteui/components/combobox';
import { CommandPalette } from '@absoluteui/components/command-palette';
import { DataGrid } from '@absoluteui/components/data-grid';
import { DataTable } from '@absoluteui/components/data-table';
import { CodeViewer } from '@absoluteui/components/code-viewer';
import { Diagram } from '@absoluteui/components/diagram';
import { FileManager, type FileEntry, type FileManagerProvider } from '@absoluteui/components/file-manager';
import { ImageViewer } from '@absoluteui/components/image-viewer';
import { Timeline } from '@absoluteui/components/timeline';
import { Tour } from '@absoluteui/components/tour';
import { Dialog } from '@absoluteui/components/dialog';
import { Drawer } from '@absoluteui/components/drawer';
import { EmptyState } from '@absoluteui/components/empty-state';
import { Fieldset } from '@absoluteui/components/fieldset';
import { FormBuilder } from '@absoluteui/components/form-builder';
import { Kbd } from '@absoluteui/components/kbd';
import { LineChart } from '@absoluteui/components/line-chart';
import { MaskedInput } from '@absoluteui/components/masked-input';
import { MentionInput } from '@absoluteui/components/mention-input';
import { Menu } from '@absoluteui/components/menu';
import { MultiSelect } from '@absoluteui/components/multi-select';
import { Popover } from '@absoluteui/components/popover';
import { ProgressBar } from '@absoluteui/components/progress-bar';
import { RadioGroup } from '@absoluteui/components/radio-group';
import { SchemaForm } from '@absoluteui/components/schema-form';
import { Rating } from '@absoluteui/components/rating';
import { ScrollArea } from '@absoluteui/components/scroll-area';
import { Select } from '@absoluteui/components/select';
import { SignaturePad } from '@absoluteui/components/signature-pad';
import { Slider } from '@absoluteui/components/slider';
import { Splitter } from '@absoluteui/components/splitter';
import { Switch } from '@absoluteui/components/switch';
import { Tabs } from '@absoluteui/components/tabs';
import { TagGroup } from '@absoluteui/components/tag-group';
import { TextInput } from '@absoluteui/components/text-input';
import { Textarea } from '@absoluteui/components/textarea';
import { Toaster } from '@absoluteui/components/toast';
import { ToggleGroup } from '@absoluteui/components/toggle-group';
import { Tooltip } from '@absoluteui/components/tooltip';
import { TreeSelect } from '@absoluteui/components/tree-select';
import { TreeView } from '@absoluteui/components/tree-view';
import { VirtualList } from '@absoluteui/components/virtual-list';
import { TransferList } from '@absoluteui/components/transfer-list';
import { isThemeMessage, type ReadyMessage } from './src/protocol.js';

const main = document.getElementById('preview');
if (!(main instanceof HTMLElement)) throw new Error('Missing #preview');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(title: string, id: string): HTMLElement {
  const s = el('section', 'fr-section');
  s.setAttribute('aria-labelledby', id);
  const h = el('h2', 'fr-heading', title);
  h.id = id;
  const body = el('div', 'fr-body');
  s.append(h, body);
  main?.append(s);
  return body;
}

function row(parent: HTMLElement): HTMLElement {
  const r = el('div', 'fr-row');
  parent.append(r);
  return r;
}

function hostIn(parent: HTMLElement): HTMLDivElement {
  const d = el('div', 'fr-cell');
  parent.append(d);
  return d;
}

/** Class-free host for components that style the host element itself. */
function bareIn<K extends 'div' | 'span'>(parent: HTMLElement, tag: K): HTMLElementTagNameMap[K] {
  const node = el(tag);
  parent.append(node);
  return node;
}

const button = (parent: HTMLElement, text: string, options: Parameters<typeof Button.create>[0] = {}): Button => {
  const b = Button.create({ text, ...options });
  parent.append(b.element);
  return b;
};

// Typography and surfaces.
{
  const body = section('Typography and surfaces', 'fr-type');
  body.append(el('p', 'fr-lead', 'Body text on the page background.'), el('p', 'fr-muted', 'Supporting text uses the muted role.'));
  const link = el('a', 'fr-link', 'A link on the page background');
  link.href = '#preview';
  body.append(link);
  const cards = row(body);
  Card.create(hostIn(cards), { title: 'Card title', subtitle: 'Subtitle', content: 'Card body text on a surface.', footer: el('span', 'fr-muted', 'Footer') });
  Card.create(hostIn(cards), { title: 'Raised card', content: 'Elevation comes from the card shadow token.', variant: 'raised' });
}

// Buttons: variants, sizes, disabled, loading, focus-visible.
{
  const body = section('Buttons and states', 'fr-buttons');
  const variants = row(body);
  button(variants, 'Primary', { variant: 'primary' });
  button(variants, 'Secondary');
  button(variants, 'Ghost', { variant: 'ghost' });
  button(variants, 'Delete', { variant: 'danger' });
  const states = row(body);
  button(states, 'Small', { size: 'sm' });
  button(states, 'Large', { size: 'lg', variant: 'primary' });
  const disabled = button(states, 'Disabled', { variant: 'primary' });
  disabled.element.disabled = true;
  button(states, 'Saving', { loading: true });
  // Static samples draw the ring with the same tokens as the focus-ring mixin, so the preview
  // never steals focus from the designer.
  button(states, 'Focus-visible sample').element.classList.add('fr-focus-sample');
  button(states, 'Focus on primary', { variant: 'primary' }).element.classList.add('fr-focus-sample');
  const toggles = row(body);
  button(toggles, 'Bold (pressed)', { pressed: true });
  button(toggles, 'Italic (not pressed)', { pressed: false });
  ToggleGroup.create(bareIn(toggles, 'div'), { label: 'Text alignment', attached: true, value: ['center'], items: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Center' }, { value: 'end', label: 'End' }] });
  ToggleGroup.create(bareIn(toggles, 'div'), { label: 'Formats', multiple: true, value: ['b', 'u'], items: [{ value: 'b', label: 'Bold' }, { value: 'i', label: 'Italic' }, { value: 'u', label: 'Underline' }, { value: 's', label: 'Strike', disabled: true }] });
}

// Form controls with valid, invalid, disabled, and read-only states.
{
  const body = section('Form controls', 'fr-forms');
  const grid = el('div', 'fr-grid');
  body.append(grid);
  TextInput.create(hostIn(grid), { label: 'Name', placeholder: 'Ada Lovelace' });
  const invalid = TextInput.create(hostIn(grid), { label: 'Email', value: 'ada@', type: 'email' });
  invalid.setCustomError('Enter a complete email address.');
  invalid.reportValidity();
  TextInput.create(hostIn(grid), { label: 'Disabled', value: 'Not editable', disabled: true });
  TextInput.create(hostIn(grid), { label: 'Read-only', value: 'Read only', readOnly: true });
  Select.create(hostIn(grid), { label: 'Country', options: [{ value: 'in', label: 'India' }, { value: 'fr', label: 'France' }, { value: 'jp', label: 'Japan' }], value: 'fr' });
  Combobox.create(hostIn(grid), { label: 'City', options: [{ value: 'par', label: 'Paris' }, { value: 'lyo', label: 'Lyon' }, { value: 'nic', label: 'Nice' }], placeholder: 'Type to search' });
  const skills = [{ value: 'ts', label: 'TypeScript' }, { value: 'css', label: 'CSS' }, { value: 'a11y', label: 'Accessibility' }, { value: 'sql', label: 'SQL' }];
  MultiSelect.create(bareIn(grid, 'div'), { label: 'Skills', options: skills, value: ['ts', 'a11y'], placeholder: 'Choose skills' });
  MultiSelect.create(bareIn(grid, 'div'), { label: 'Required skills', options: skills, required: true, invalid: true, errorMessage: 'Choose at least one skill.' });
  Textarea.create(hostIn(grid), { label: 'Notes', rows: 3, value: 'Multi-line text.' });
  const checks = hostIn(grid);
  Checkbox.create(hostIn(checks), { label: 'Checked', checked: true });
  Checkbox.create(hostIn(checks), { label: 'Unchecked' });
  Checkbox.create(hostIn(checks), { label: 'Indeterminate', indeterminate: true });
  Checkbox.create(hostIn(checks), { label: 'Disabled', disabled: true, checked: true });
  RadioGroup.create(hostIn(grid), { label: 'Plan', options: [{ value: 'a', label: 'Starter' }, { value: 'b', label: 'Team' }, { value: 'c', label: 'Enterprise', disabled: true }], value: 'b' });
  const switches = hostIn(grid);
  Switch.create(hostIn(switches), { label: 'Notifications', checked: true });
  Switch.create(hostIn(switches), { label: 'Beta features' });
  Switch.create(hostIn(switches), { label: 'Disabled', disabled: true });
  const sliders = hostIn(grid);
  Slider.create(bareIn(sliders, 'div'), { label: 'Volume', value: 40, marks: true, step: 10 });
  Slider.create(bareIn(sliders, 'div'), { label: 'Price range', range: true, value: [20, 70] });
  Slider.create(bareIn(sliders, 'div'), { label: 'Disabled', value: 60, disabled: true });
  const address = el('fieldset');
  body.append(address);
  const fields = el('div', 'fr-grid');
  address.append(fields);
  TextInput.create(hostIn(fields), { label: 'Street', value: '12 Rue de Rivoli' });
  TextInput.create(hostIn(fields), { label: 'Postal code', value: '75001' });
  Fieldset.enhance(address, { legend: 'Address', description: 'Fieldsets group related controls under one legend.', required: true });
  const contact = el('fieldset');
  body.append(contact);
  Checkbox.create(hostIn(contact), { label: 'Email' });
  Checkbox.create(hostIn(contact), { label: 'Phone' });
  Fieldset.enhance(contact, { legend: 'Contact preference', error: 'Choose at least one way to reach you.' });
}

// Generated forms: Schema Form and Form Builder (R20 P7).
{
  const body = section('Generated forms', 'fr-schema-forms');
  SchemaForm.create(bareIn(body, 'div'), {
    schema: {
      type: 'object',
      title: 'Leave request',
      required: ['type'],
      properties: {
        type: { type: 'string', title: 'Leave type', oneOf: [{ const: 'annual', title: 'Annual leave' }, { const: 'sick', title: 'Sick leave' }] },
        halfDay: { type: 'boolean', title: 'Half day' },
        note: { type: 'string', title: 'Note' },
      },
    },
    uiSchema: { columns: 2, fields: { halfDay: { widget: 'switch' }, note: { widget: 'textarea', span: 2 } } },
    submitLabel: 'Request leave',
  });
  FormBuilder.create(bareIn(body, 'div'), {
    label: 'Sample form builder',
    schema: { type: 'object', properties: { name: { type: 'string', title: 'Full name' }, start: { type: 'string', title: 'Start date', format: 'date' } }, required: ['name'] },
  });
}

// Content: badges, avatars, keyboard keys, and tags.
{
  const body = section('Badges, avatars, and tags', 'fr-content');
  const badges = row(body);
  const tones = [['neutral', 'Neutral'], ['info', 'Info'], ['success', 'Success'], ['warning', 'Warning'], ['error', 'Error']] as const;
  for (const [tone, label] of tones) Badge.create(bareIn(badges, 'span'), { label, tone });
  Badge.create(bareIn(badges, 'span'), { label: 'Outline', variant: 'outline' });
  Badge.create(bareIn(badges, 'span'), { label: 'With dot', tone: 'success', dot: true });
  const avatars = row(body);
  Avatar.create(bareIn(avatars, 'span'), { name: 'Ada Lovelace', status: 'online' });
  Avatar.create(bareIn(avatars, 'span'), { name: 'Grace Hopper', size: 'lg', status: 'away' });
  Avatar.create(bareIn(avatars, 'span'), { name: 'Alan Turing', shape: 'square', size: 'lg' });
  AvatarGroup.create(bareIn(avatars, 'div'), { label: 'Project team', max: 3, items: [{ name: 'Ada Lovelace', status: 'online' }, { name: 'Grace Hopper' }, { name: 'Alan Turing' }, { name: 'Katherine Johnson' }, { name: 'Edsger Dijkstra' }] });
  const keys = row(body);
  keys.append(el('span', 'fr-muted', 'Shortcuts:'));
  Kbd.create(bareIn(keys, 'span'), { hotkey: 'Mod+K' });
  Kbd.create(bareIn(keys, 'span'), { hotkey: 'Shift+Enter' });
  TagGroup.create(bareIn(body, 'div'), { label: 'Filters', items: [{ value: 'open', label: 'Open' }, { value: 'mine', label: 'Assigned to me' }, { value: 'old', label: 'Archived', disabled: true }], removable: true });
  TagGroup.create(bareIn(body, 'div'), { label: 'Departments', selection: 'multiple', value: ['eng'], items: [{ value: 'eng', label: 'Engineering' }, { value: 'hr', label: 'People' }, { value: 'fin', label: 'Finance' }] });
}

// Disclosure, scrolling, and slides.
{
  const body = section('Disclosure and scrolling', 'fr-disclosure');
  Collapsible.create(bareIn(body, 'div'), { label: 'Bordered collapsible (open)', content: 'Bordered collapsibles use the collapsible radius and border tokens.', variant: 'bordered', open: true });
  Collapsible.create(bareIn(body, 'div'), { label: 'Plain collapsible', content: 'Plain collapsibles have no boundary.' });
  const cells = row(body);
  const scroll = bareIn(hostIn(cells), 'div');
  for (let i = 1; i <= 12; i++) scroll.append(el('p', 'fr-lead', `Scrollable line ${String(i)}`));
  ScrollArea.enhance(scroll, { label: 'Scroll area sample', maxBlockSize: '10rem' });
  Carousel.create(bareIn(hostIn(cells), 'div'), {
    label: 'Sample slides',
    slides: [
      { content: el('p', 'fr-slide', 'First slide'), label: 'First' },
      { content: el('p', 'fr-slide', 'Second slide'), label: 'Second' },
      { content: el('p', 'fr-slide', 'Third slide'), label: 'Third' },
    ],
  });
}

// Workspace: a splitter with a virtual list and an empty state.
{
  const body = section('Splitter, virtual list, and empty state', 'fr-workspace');
  const people = Array.from({ length: 1000 }, (_, i) => `Employee ${String(i + 1)}`);
  const listHost = el('div');
  VirtualList.create<string>(listHost, { label: 'Employees', items: people, selection: 'single', value: ['2'], height: null, renderItem: (name) => document.createTextNode(name) });
  const detail = el('div');
  EmptyState.create(detail, { title: 'No employee selected', description: 'Empty states use the empty-state icon tokens.', icon: 'search', size: 'sm', primaryAction: { label: 'Add employee', icon: 'plus' } });
  const split = bareIn(body, 'div');
  split.classList.add('fr-split');
  Splitter.create(split, { panes: [{ content: listHost, label: 'Employees', size: '40%', min: 120 }, { content: detail, label: 'Details', min: 160 }] });
}

// Conversation: chat bubbles, Markdown, code, and the composer.
{
  const body = section('Conversation', 'fr-chat');
  const chatHost = bareIn(body, 'div');
  chatHost.style.setProperty('block-size', '24rem');
  Chat.create(chatHost, {
    label: 'Sample conversation',
    suggestions: [{ id: 's1', label: 'Show my leave balance' }],
    prompt: { attachments: true, placeholder: 'Ask a question' },
    messages: [
      { id: 'c1', role: 'user', text: 'How do I submit an expense?' },
      { id: 'c2', role: 'assistant', text: 'Open **Expenses**, attach the receipt, and pick a category. See [the policy](https://example.com/policy).\n\n```text\nMeals   up to 45 EUR per day\n```', feedback: 'up' },
      { id: 'c3', role: 'assistant', text: 'Partial answer', status: 'error', error: 'The assistant is unavailable right now.' },
    ],
  });
  // Discussion (R20-25): nested replies, a mention chip, a deleted placeholder, and the counter.
  const ago = (minutes: number): ReturnType<typeof instant> => instant(Date.now() - minutes * 60_000);
  const grace = { id: 'grace', name: 'Grace Hopper' };
  const ada = { id: 'ada', name: 'Ada Lovelace' };
  Discussion.create(bareIn(body, 'div'), {
    label: 'Comments',
    currentUser: ada,
    maxLength: 280,
    maxIndent: 2,
    comments: [
      { id: 'd1', parentId: null, author: grace, text: 'Desk booking opens next week: https://example.com/desks', createdAt: ago(120) },
      { id: 'd2', parentId: 'd1', author: ada, text: 'Thanks @Grace Hopper!', mentions: [{ id: 'grace', label: 'Grace Hopper', trigger: '@', start: 7, end: 20 }], createdAt: ago(60), editedAt: ago(50) },
      { id: 'd3', parentId: 'd2', author: grace, text: 'You are welcome.', createdAt: ago(30) },
      { id: 'd4', parentId: null, author: grace, text: '', deleted: true, createdAt: ago(20) },
      { id: 'd5', parentId: 'd4', author: ada, text: 'This reply keeps the placeholder.', createdAt: ago(10) },
    ],
  });
}

// Preference controls (R20 P9): color, rating, masks, mentions, hierarchies, transfer, signature.
{
  const body = section('Preference controls', 'fr-preferences');
  const grid = el('div', 'fr-grid');
  body.append(grid);
  ColorPicker.create(bareIn(grid, 'div'), { label: 'Accent color', mode: 'inline', value: '#2563eb', presets: [{ value: '#2563eb', label: 'Blue' }, { value: '#15803d', label: 'Green' }, { value: '#b91c1c', label: 'Red' }], contrastWith: '#ffffff' });
  const ratings = hostIn(grid);
  Rating.create(bareIn(ratings, 'div'), { label: 'Rating', value: 3.5, allowHalf: true });
  Rating.create(bareIn(ratings, 'div'), { label: 'Display', value: 4, display: true, size: 'sm' });
  Rating.create(bareIn(ratings, 'div'), { label: 'Disabled rating', value: 2, disabled: true });
  MaskedInput.create(bareIn(grid, 'div'), { label: 'Phone', mask: '(999) 999-9999', value: '5550100199' });
  MentionInput.create(bareIn(grid, 'div'), { label: 'Comment', triggers: [{ char: '@', provider: () => Promise.resolve([{ id: 'ada', label: 'Ada Lovelace' }]) }], value: { text: 'Thanks @Ada Lovelace', mentions: [{ id: 'ada', label: 'Ada Lovelace', trigger: '@', start: 7, end: 20 }] } });
  Cascader.create(bareIn(grid, 'div'), { label: 'Location', options: [{ value: 'fr', label: 'France', children: [{ value: 'idf', label: 'Ile-de-France', children: [{ value: 'par', label: 'Paris' }] }] }], value: ['fr', 'idf', 'par'] });
  TransferList.create(bareIn(body, 'div'), { label: 'Team members', items: [{ value: 'ada', label: 'Ada Lovelace' }, { value: 'grace', label: 'Grace Hopper' }, { value: 'alan', label: 'Alan Turing' }, { value: 'kat', label: 'Katherine Johnson' }], value: ['grace'] });
  SignaturePad.create(bareIn(body, 'div'), { label: 'Signature', mode: 'type', value: { mode: 'type', text: 'Ada Lovelace' }, height: '6rem' });
}

// Feedback: status tones.
{
  const body = section('Status and feedback', 'fr-feedback');
  Alert.create(hostIn(body), { tone: 'info', title: 'Information', message: 'Informational alert text.' });
  Alert.create(hostIn(body), { tone: 'success', title: 'Saved', message: 'Your changes are saved.' });
  Alert.create(hostIn(body), { tone: 'warning', title: 'Check your input', message: 'Some values look unusual.' });
  Alert.create(hostIn(body), { tone: 'error', title: 'Upload failed', message: 'The file is larger than 10 MB.' });
  const bars = el('div', 'fr-grid');
  body.append(bars);
  ProgressBar.create(hostIn(bars), { label: 'Uploading', value: 60, showValue: true });
  ProgressBar.create(hostIn(bars), { label: 'Complete', value: 100, tone: 'success', showValue: true });
  ProgressBar.create(hostIn(bars), { label: 'Failed', value: 35, tone: 'error', showValue: true });
  const toaster = Toaster.create({ position: 'bottom-end' });
  button(row(body), 'Show toasts').element.addEventListener('click', () => {
    toaster.show({ tone: 'success', title: 'Saved', message: 'Changes saved.', duration: 0 });
    toaster.show({ tone: 'error', message: 'Could not reach the server.', duration: 0 });
  });
}

// Navigation and data.
{
  const body = section('Navigation and data', 'fr-data');
  Tabs.create(hostIn(body), {
    label: 'Sample tabs',
    tabs: [
      { id: 'overview', label: 'Overview', content: 'Selected tabs show an indicator and a heavier weight.' },
      { id: 'activity', label: 'Activity', content: 'Activity panel.' },
      { id: 'settings', label: 'Settings', content: 'Settings panel.', disabled: true },
    ],
  });
  interface Row {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly hours: number;
  }
  const rows: Row[] = [
    { id: '1', name: 'Ada Lovelace', role: 'Engineer', hours: 38 },
    { id: '2', name: 'Grace Hopper', role: 'Admiral', hours: 41 },
    { id: '3', name: 'Alan Turing', role: 'Researcher', hours: 36 },
  ];
  DataTable.create<Row>(hostIn(body), {
    caption: 'Team',
    rowId: (r) => r.id,
    rows,
    selection: 'multiple',
    selected: ['2'],
    sort: { column: 'name', direction: 'ascending' },
    columns: [
      { id: 'name', header: 'Name', accessor: (r) => r.name },
      { id: 'role', header: 'Role', accessor: (r) => r.role },
      { id: 'hours', header: 'Hours', accessor: (r) => r.hours, type: 'number' },
    ],
  });
  DataGrid.create<Row>(bareIn(body, 'div'), {
    label: 'Team grid',
    rowId: (r) => r.id,
    rows,
    rowSelection: { mode: 'multiple', checkboxes: true },
    selected: ['2'],
    sort: { column: 'name', direction: 'ascending' },
    filters: { hours: { kind: 'number', conditions: [{ operator: 'greaterThan', value: 30 }] } },
    columns: [
      { id: 'name', header: 'Name', field: 'name', filter: 'text', flex: 1 },
      { id: 'role', header: 'Role', field: 'role', filter: 'text', flex: 1 },
      { id: 'hours', header: 'Hours', field: 'hours', type: 'number', filter: 'number', width: 120 },
    ],
  });
}

// Diagram: nodes, a selected node, connectors with labels, and the edit-mode grid.
{
  const body = section('Diagram', 'fr-diagram');
  const diagramHost = bareIn(body, 'div');
  diagramHost.classList.add('fr-diagram');
  const diagram = Diagram.create(diagramHost, {
    label: 'Approval route',
    editable: true,
    textAlternative: 'none',
    layout: { direction: 'LR', rankGap: 48 },
    model: {
      nodes: [
        { id: 'request', label: 'Request', shape: 'ellipse', width: 120, height: 52 },
        { id: 'manager', label: 'Manager approval', shape: 'diamond', height: 88 },
        { id: 'approved', label: 'Approved', width: 120 },
        { id: 'rejected', label: 'Rejected', width: 120 },
      ],
      edges: [
        { id: 'a', from: 'request', to: 'manager' },
        { id: 'b', from: 'manager', to: 'approved', label: 'Yes' },
        { id: 'c', from: 'manager', to: 'rejected', label: 'No', dashed: true },
      ],
    },
  });
  diagram.select(['manager']);
}

// Trees: selection, tri-state checkboxes, a filter match, and a tree select field.
{
  const body = section('Trees', 'fr-trees');
  const r = row(body);
  const departments = [
    { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web' }, { id: 'platform', label: 'Platform' }] },
    { id: 'ops', label: 'Operations', children: [{ id: 'facilities', label: 'Facilities' }, { id: 'it', label: 'IT support', disabled: true }] },
  ];
  TreeView.create(hostIn(r), { label: 'Departments', nodes: departments, selection: 'single', selected: ['web'], expanded: ['eng', 'ops'], height: '13rem', filter: 'form' });
  TreeView.create(hostIn(r), { label: 'Access', nodes: departments, checkboxes: true, checked: ['web'], expanded: ['eng', 'ops'], height: '13rem' });
  TreeSelect.create(hostIn(body), { label: 'Department', nodes: departments, value: ['platform'] });
}

// Documents and content (R20 P10): timeline tones, highlighted code and a diff, an image viewer, and a file manager.
{
  const body = section('Documents and content', 'fr-documents');
  const at = (day: number, hour: number): Instant => instant(Date.UTC(2026, 10, day, hour));
  Timeline.create(hostIn(body), {
    label: 'Document activity',
    timezone: 'UTC',
    now: at(23, 12),
    items: [
      { id: 'approved', title: 'Policy approved', tone: 'success', time: at(23, 10), description: 'Approved by Ada Lovelace.' },
      { id: 'review', title: 'Review requested', tone: 'info', time: at(22, 15) },
      { id: 'scan', title: 'Virus scan failed', tone: 'error', time: at(22, 9), status: 'Blocked' },
      { id: 'expiry', title: 'Contract expires soon', tone: 'warning', time: at(21, 8) },
    ],
  });
  CodeViewer.create(hostIn(body), { label: 'Policy change', language: 'json', filename: 'leave-policy.json', diff: { original: '{\n  "annualDays": 25,\n  "carryOver": 5\n}', modified: '{\n  "annualDays": 26,\n  "carryOver": 5,\n  "halfDays": true\n}', mode: 'unified' } });
  CodeViewer.create(hostIn(body), { label: 'Export script', language: 'typescript', highlightLines: [2], code: "// Export employees as JSON.\nexport async function exportEmployees(limit = 100): Promise<string> {\n  const rows = await fetch(`/api/employees?limit=${String(limit)}`);\n  return JSON.stringify(await rows.json(), null, 2);\n}" });
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 270;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(0, 0, 480, 270);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(160, 60, 160, 150);
  }
  const photo = canvas.toDataURL('image/png');
  ImageViewer.create(hostIn(body), { label: 'Scanned ID', images: [{ src: photo, alt: 'Scanned ID card, front' }, { src: photo, alt: 'Scanned ID card, back' }] });
  const files: FileEntry[] = [
    { id: 'policies', name: 'Policies', kind: 'folder', parentId: null, hasChildren: false },
    { id: 'handbook', name: 'Handbook.md', kind: 'file', size: 18200, mimeType: 'text/markdown', modified: at(20, 9), parentId: null },
    { id: 'export', name: 'Employees.json', kind: 'file', size: 4100, mimeType: 'application/json', modified: at(21, 9), parentId: null },
  ];
  const provider: FileManagerProvider = {
    list: (folderId) => Promise.resolve(files.filter((f) => f.parentId === folderId)),
    createFolder: (parentId, name) => Promise.resolve({ id: name, name, kind: 'folder', parentId }),
    rename: (entry, name) => Promise.resolve({ ...entry, name }),
    move: (moved, target) => Promise.resolve(moved.map((e) => ({ ...e, parentId: target }))),
    delete: () => Promise.resolve(),
    upload: (folderId, file) => Promise.resolve({ id: file.name, name: file.name, kind: 'file', size: file.size, parentId: folderId }),
  };
  FileManager.create(hostIn(body), { label: 'Documents', provider, height: '20rem', preview: false });
}

// Overlays open on demand.
{
  const body = section('Overlays', 'fr-overlays');
  const r = row(body);
  const dialog = Dialog.create({ title: 'Dialog title', description: 'Dialogs use the dialog radius, shadow, and backdrop.', content: 'Dialog body text.', actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Confirm', value: 'ok', variant: 'primary' }] });
  button(r, 'Open dialog').element.addEventListener('click', () => {
    dialog.open();
  });
  const drawer = Drawer.create({ title: 'Drawer title', content: 'Drawer body text.' });
  button(r, 'Open drawer').element.addEventListener('click', () => {
    drawer.open();
  });
  const menuTrigger = button(r, 'Open menu').element;
  Menu.create(menuTrigger, { label: 'Actions', items: [{ id: 'edit', label: 'Edit', shortcut: 'E' }, { id: 'dup', label: 'Duplicate', description: 'Copy this item' }, { type: 'separator' }, { id: 'del', label: 'Delete', tone: 'danger' }] });
  const popTrigger = button(r, 'Open popover').element;
  Popover.create(popTrigger, { title: 'Popover', content: 'Popover content on a surface.' });
  const palette = CommandPalette.create(bareIn(body, 'div'), {
    shortcut: null,
    commands: [
      { id: 'go-home', label: 'Go to dashboard', group: 'Navigation' },
      { id: 'leave', label: 'Request leave', group: 'Actions', shortcut: 'Mod+L' },
      { id: 'theme', label: 'Change theme', group: 'Actions', children: [{ id: 'light', label: 'Light' }] },
    ],
  });
  button(r, 'Open command palette').element.addEventListener('click', () => {
    palette.open({ query: 'go' });
  });
  const tourTrigger = button(r, 'Start tour').element;
  const tour = Tour.create(bareIn(body, 'div'), {
    dots: true,
    steps: [
      { id: 'dialog', title: 'Tour step', content: 'Tour panels use the tour surface, radius, and shadow; the spotlight ring marks the target.', target: () => tourTrigger },
      { id: 'end', title: 'Centered step', content: 'Steps without a target are centered.' },
    ],
  });
  tourTrigger.addEventListener('click', () => {
    void tour.start();
  });
  const tipTrigger = button(r, 'Tooltip on hover or focus').element;
  Tooltip.create(tipTrigger, { content: 'Tooltip text on the inverse surface.' });
}

// Data visualization palette.
{
  const body = section('Data visualization palette', 'fr-charts');
  const series = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `s${String(n)}`, label: `Series ${String(n)}`, values: [n + 2, n * 1.5 + 1, 12 - n] }));
  const charts = row(body);
  BarChart.create(hostIn(charts), { label: 'Plain colors (default)', categories: ['Q1', 'Q2', 'Q3'], series, height: 240 });
  BarChart.create(hostIn(charts), { label: 'With patterns (patterns: true)', categories: ['Q1', 'Q2', 'Q3'], series, height: 240, patterns: true });
  const trends = row(body);
  LineChart.create(hostIn(trends), {
    label: 'Lines, area, and an annotation',
    x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    area: true,
    series: [
      { id: 'a', label: 'Series 1', values: [12, 18, 15, 22, 26, 24] },
      { id: 'b', label: 'Series 2', values: [8, 10, 14, 12, 16, 19] },
    ],
    annotations: [{ type: 'band', axis: 'y', from: 15, to: 20, label: 'Target range', tone: 'success' }],
    height: 240,
  });
  // Advanced visualizations (R20 P11): candle up and down colors, networks, and calendars.
  const special = row(body);
  const candles = Array.from({ length: 24 }, (_, i) => {
    const open = 100 + Math.sin(i / 3) * 6;
    const close = open + (i % 3 === 0 ? -2.5 : 2);
    return { date: addDays(plainDate(2026, 3, 2), i), open, close, high: Math.max(open, close) + 1.5, low: Math.min(open, close) - 1.5, volume: 900 + ((i * 53) % 400) };
  });
  CandlestickChart.create(hostIn(special), { label: 'Candles (up and down colors)', data: candles, movingAverages: [{ period: 5 }], height: 240 });
  const more = row(body);
  CalendarHeatmap.create(hostIn(more), { label: 'Daily activity', from: plainDate(2026, 1, 1), to: plainDate(2026, 3, 31), data: Array.from({ length: 90 }, (_, i) => ({ date: addDays(plainDate(2026, 1, 1), i), value: (i * 7) % 9 })), height: 160 });
  NetworkGraph.create(hostIn(more), {
    label: 'Network',
    nodes: ['A', 'B', 'C', 'D', 'E', 'F'].map((id, i) => ({ id, label: `Node ${id}`, group: i % 2 === 0 ? 'one' : 'two' })),
    edges: [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }, { source: 'C', target: 'D' }, { source: 'D', target: 'A' }, { source: 'E', target: 'A' }, { source: 'F', target: 'C' }],
    animate: false,
    zoom: false,
    height: 240,
  });
}

// Theme application from the designer.
let sheet: CSSStyleSheet | null = null;
const fontLinks = new Map<string, HTMLLinkElement>();
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent || !isThemeMessage(event.data)) return;
  const { css, theme, density } = event.data;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  sheet.replaceSync(css);
  const wanted = new Set(event.data.fonts);
  for (const [url, link] of fontLinks) {
    if (!wanted.has(url)) {
      link.remove();
      fontLinks.delete(url);
    }
  }
  for (const url of wanted) {
    if (fontLinks.has(url)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    document.head.append(link);
    fontLinks.set(url, link);
  }
  document.documentElement.dataset.auiTheme = theme;
  if (density === 'comfortable') delete document.documentElement.dataset.auiDensity;
  else document.documentElement.dataset.auiDensity = density;
  document.documentElement.dataset.previewReady = 'true';
});

const ready: ReadyMessage = { type: 'aui-designer-ready' };
window.parent.postMessage(ready, location.origin);
