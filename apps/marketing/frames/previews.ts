// Gallery previews for components whose docs examples need page markup or a user action
// to show anything (docs/PLAN-R4.md C7): Skeleton, Bottom Sheet, Context Menu, and Button
// Group (its docs header omits the Button stylesheet, so the docs frame is unstyled). The frame
// renders the one named in its body's data-preview attribute.
import { BottomSheet } from '@absoluteui/components/bottom-sheet';
import { ButtonGroup } from '@absoluteui/components/button-group';
import { ContextMenu } from '@absoluteui/components/context-menu';
import { Skeleton } from '@absoluteui/components/skeleton';
import './runtime.js';

const host = document.getElementById('preview');
const which = document.body.dataset.preview;

if (host && which === 'skeleton') {
  const card = document.createElement('div');
  card.className = 'panel rows';
  const head = document.createElement('div');
  head.className = 'row';
  const avatar = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'grow';
  head.append(avatar, title);
  const body = document.createElement('div');
  card.append(head, body);
  host.append(card);
  Skeleton.create(avatar, { shape: 'circle', width: '3rem', height: '3rem', animation: 'none' });
  Skeleton.create(title, { shape: 'text', lines: 2, animation: 'none' });
  Skeleton.create(body, { shape: 'rect', height: '6rem', animation: 'none' });
}

if (host && which === 'bottom-sheet') {
  const content = document.createElement('p');
  content.textContent = 'Anyone with the link can view this report.';
  BottomSheet.create({ title: 'Share report', description: 'Send a link or copy it.', content, modal: false }).open();
}

if (host && which === 'context-menu') {
  const list = document.createElement('ul');
  list.className = 'files';
  for (const name of ['Q3 forecast.xlsx', 'Board deck.pdf', 'Hiring plan.docx']) {
    const item = document.createElement('li');
    item.textContent = name;
    list.append(item);
  }
  host.append(list);
  const menu = ContextMenu.create(list, {
    label: 'File actions',
    items: [
      { id: 'open', label: 'Open', shortcut: 'Enter' },
      { id: 'rename', label: 'Rename', shortcut: 'F2' },
      { id: 'share', label: 'Share' },
      { type: 'separator' },
      { id: 'delete', label: 'Delete', tone: 'danger' },
    ],
  });
  const first = list.firstElementChild?.getBoundingClientRect();
  menu.open({ x: (first?.left ?? 0) + 120, y: (first?.bottom ?? 0) + 4 });
}

if (host && which === 'button-group') {
  const views = document.createElement('div');
  const actions = document.createElement('div');
  host.className = 'rows';
  host.append(views, actions);
  ButtonGroup.create(views, { label: 'Calendar view', buttons: [{ text: 'Day' }, { text: 'Week', variant: 'primary' }, { text: 'Month' }] });
  ButtonGroup.create(actions, { label: 'Document actions', buttons: [{ text: 'Edit', icon: 'code' }, { text: 'Download', icon: 'download' }, { text: 'Delete', icon: 'trash', variant: 'danger' }] });
}
