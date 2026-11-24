// Overlays showcase: a dialog with a confirmation flow, an alert dialog, drawers from each side,
// a bottom sheet with snap points, a popover form, tooltips, and a hover card.
import { Button } from '@absoluteui/components/button';
import { BottomSheet } from '@absoluteui/components/bottom-sheet';
import { Dialog } from '@absoluteui/components/dialog';
import { Drawer } from '@absoluteui/components/drawer';
import { HoverCard } from '@absoluteui/components/hover-card';
import { Popover } from '@absoluteui/components/popover';
import { TextInput } from '@absoluteui/components/text-input';
import { Tooltip } from '@absoluteui/components/tooltip';
import { choice, createShowcase, hostIn, section, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Overlays',
  description: 'Open each overlay with the mouse or keyboard. Focus moves in and returns to the opener; Escape closes.',
});

let closeOnBackdrop = true;
let placement: 'start' | 'end' | 'top' | 'bottom' = 'end';

const row = (parent: HTMLElement): HTMLElement => {
  const r = hostIn(parent);
  r.className = 'sc-row';
  return r;
};
const opener = (parent: HTMLElement, text: string, variant: 'primary' | 'secondary' | 'danger' = 'secondary'): Button => {
  const b = Button.create({ text, variant }, document);
  parent.append(b.element);
  return b;
};
const hint = (text: string): HTMLElement => {
  const p = document.createElement('span');
  p.className = 'sc-hint';
  p.textContent = text;
  return p;
};
const track = (el: HTMLElement, name: string): void => {
  sc.listen(el, ['aui-open', 'aui-close'], name);
};

// Dialogs.
const dialogs = row(section(sc, 'Dialogs', ['dialog']));
const edit = opener(dialogs, 'Edit name', 'primary');
edit.element.addEventListener('click', () => {
  const body = document.createElement('div');
  const field = TextInput.create(hostIn(body), { label: 'Display name', value: 'Ada Lovelace', required: true });
  const d = Dialog.create({ title: 'Edit display name', description: 'Shown to everyone in your organization.', content: body, closeOnBackdrop, actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'save', variant: 'primary' }] });
  track(d.element, 'dialog');
  d.element.addEventListener('aui-cancel', (e) => {
    // Keep the dialog open while the field is invalid.
    if ((e as CustomEvent<{ returnValue: string }>).detail.returnValue === 'save' && !field.reportValidity()) e.preventDefault();
  });
  d.element.addEventListener('aui-close', () => {
    queueMicrotask(() => {
      d.destroy();
    });
  });
  d.open();
});
const del = opener(dialogs, 'Delete account', 'danger');
del.element.addEventListener('click', () => {
  const d = Dialog.create({ role: 'alertdialog', title: 'Delete your account?', description: 'All your data is removed. This cannot be undone.', size: 'sm', actions: [{ label: 'Keep account', value: 'keep', autofocus: true }, { label: 'Delete', value: 'delete', variant: 'danger' }] });
  track(d.element, 'alert dialog');
  d.element.addEventListener('aui-close', () => {
    queueMicrotask(() => {
      d.destroy();
    });
  });
  d.open();
});

// Drawer and bottom sheet.
const filters = opener(row(section(sc, 'Drawer', ['drawer'])), 'Open filters drawer');
filters.element.addEventListener('click', () => {
  const body = document.createElement('div');
  TextInput.create(hostIn(body), { label: 'Search people', type: 'search' });
  const d = Drawer.create({ title: 'Filters', content: body, placement, closeOnBackdrop, actions: [{ label: 'Reset', value: 'reset' }, { label: 'Apply', value: 'apply', variant: 'primary' }] });
  track(d.element, 'drawer');
  d.element.addEventListener('aui-close', () => {
    queueMicrotask(() => {
      d.destroy();
    });
  });
  d.open();
});
const sheet = opener(row(section(sc, 'Bottom sheet', ['bottom-sheet'])), 'Open bottom sheet');
sheet.element.addEventListener('click', () => {
  const s = BottomSheet.create({ title: 'Share', description: 'Drag the handle or use the snap points.', content: 'Copy link, email, or download as PDF.', snapPoints: [0.4, 0.9], closeOnBackdrop });
  track(s.element, 'bottom sheet');
  sc.listen(s.element, ['aui-snap-change'], 'bottom sheet');
  s.element.addEventListener('aui-close', () => {
    queueMicrotask(() => {
      s.destroy();
    });
  });
  s.open();
});

// Anchored overlays.
const pop = opener(row(section(sc, 'Popover', ['popover'])), 'Quick note');
const noteBody = document.createElement('div');
TextInput.create(hostIn(noteBody), { label: 'Note' });
const popover = Popover.create(pop.element, { title: 'Add a note', content: noteBody, showCloseButton: true });
track(pop.element, 'popover');
const help = Button.create({ icon: 'info', label: 'Help', variant: 'ghost' }, document);
row(section(sc, 'Tooltip', ['tooltip'])).append(help.element, hint('Hover or focus the help button.'));
const tip = Tooltip.create(help.element, { content: 'Notes are visible only to you.', relation: 'description' });
const profile = document.createElement('a');
profile.href = '#ada';
profile.className = 'aui-link';
profile.textContent = 'Ada Lovelace';
profile.addEventListener('click', (e) => {
  e.preventDefault();
});
row(section(sc, 'Hover card', ['hover-card'])).append(profile, hint('Hover or focus the name for the profile card.'));
const card = document.createElement('div');
card.textContent = 'Engineering lead, London. Joined 2019.';
const hover = HoverCard.create(profile, { content: card, describe: true });
track(help.element, 'tooltip');
track(profile, 'hover card');

choice(
  sc,
  'Drawer side',
  [
    { value: 'end', label: 'End' },
    { value: 'start', label: 'Start' },
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
  ],
  'end',
  (v) => {
    placement = v;
  },
  ['drawer'],
);
choice(
  sc,
  'Anchored placement',
  [
    { value: 'bottom', label: 'Below' },
    { value: 'top', label: 'Above' },
    { value: 'right', label: 'Right' },
    { value: 'left', label: 'Left' },
  ],
  'bottom',
  (p) => {
    popover.update({ placement: p });
    tip.update({ placement: p });
    hover.update({ placement: p });
  },
  ['popover', 'tooltip', 'hover-card'],
);
toggle(sc, 'Close on backdrop', true, (v) => {
  closeOnBackdrop = v;
}, ['dialog', 'drawer', 'bottom-sheet']);
