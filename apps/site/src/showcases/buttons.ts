// Buttons showcase: every variant and size, icons, loading and disabled states,
// toggle buttons, a button group, and toggle groups, with live options and an event log.
import { Button } from '@absoluteui/components/button';
import { ButtonGroup } from '@absoluteui/components/button-group';
import { ToggleGroup } from '@absoluteui/components/toggle-group';
import { choice, createShowcase, hostIn, section, toggle } from './kit.js';

type Size = 'sm' | 'md' | 'lg';

const sc = createShowcase({
  title: 'Buttons and toolbars',
  description: 'Variants, sizes, icons, loading, toggle buttons, a button group, and toggle groups as one editor toolbar.',
});

const variants = section(sc, 'Variants', ['button']);
const row = (parent: HTMLElement): HTMLElement => {
  const r = hostIn(parent);
  r.className = 'sc-row';
  return r;
};
const variantRow = row(variants);
const all: Button[] = [];
for (const variant of ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const) {
  const b = Button.create({ text: `${variant.charAt(0).toUpperCase()}${variant.slice(1)}`, variant }, document);
  variantRow.append(b.element);
  b.element.addEventListener('click', () => {
    sc.log(`button click`, { variant });
  });
  all.push(b);
}

const icons = section(sc, 'Icons', ['button']);
const iconRow = row(icons);
const save = Button.create({ text: 'Save', icon: 'check', variant: 'primary' }, document);
const download = Button.create({ text: 'Download', icon: 'download', iconPosition: 'end' }, document);
const remove = Button.create({ icon: 'trash', label: 'Delete', variant: 'danger' }, document);
const more = Button.create({ icon: 'more-horizontal', label: 'More actions', variant: 'ghost' }, document);
iconRow.append(save.element, download.element, remove.element, more.element);
all.push(save, download, remove, more);
save.element.addEventListener('click', () => {
  // A save shows the loading state for a moment; the button stays focusable.
  save.setLoading(true);
  sc.log('save started');
  setTimeout(() => {
    save.setLoading(false);
    sc.log('save finished');
  }, 1200);
});

const toggles = section(sc, 'Toggle buttons', ['button']);
const toggleRow = row(toggles);
const pin = Button.create({ text: 'Pin', icon: 'locate', pressed: false }, document);
const mute = Button.create({ text: 'Mute', pressed: true, variant: 'outline' }, document);
toggleRow.append(pin.element, mute.element);
all.push(pin, mute);
sc.listen(pin.element, ['aui-change'], 'pin');
sc.listen(mute.element, ['aui-change'], 'mute');

const toolbar = section(sc, 'Editor toolbar', ['button-group', 'toggle-group']);
const toolbarRow = row(toolbar);
const history = ButtonGroup.create(hostIn(toolbarRow), {
  label: 'History',
  attached: true,
  buttons: [
    { icon: 'undo', label: 'Undo', value: 'undo' },
    { icon: 'redo', label: 'Redo', value: 'redo' },
  ],
});
const formatting = ToggleGroup.create(hostIn(toolbarRow), {
  label: 'Formatting',
  multiple: true,
  attached: true,
  value: ['bold'],
  items: [
    { value: 'bold', label: 'Bold', icon: 'bold', iconOnly: true },
    { value: 'italic', label: 'Italic', icon: 'italic', iconOnly: true },
    { value: 'underline', label: 'Underline', icon: 'underline', iconOnly: true },
  ],
});
const alignment = ToggleGroup.create(hostIn(toolbarRow), {
  label: 'Alignment',
  required: true,
  attached: true,
  value: ['start'],
  items: [
    { value: 'start', label: 'Align start', icon: 'align-start', iconOnly: true },
    { value: 'center', label: 'Align center', icon: 'align-center', iconOnly: true },
    { value: 'end', label: 'Align end', icon: 'align-end', iconOnly: true },
  ],
});
const view = ToggleGroup.create(hostIn(toolbarRow), {
  label: 'View',
  required: true,
  value: ['edit'],
  items: [
    { value: 'edit', label: 'Edit' },
    { value: 'preview', label: 'Preview' },
  ],
});
sc.listen(history.element, ['aui-action'], 'history');
sc.listen(formatting.host, ['aui-change'], 'formatting');
sc.listen(alignment.host, ['aui-change'], 'alignment');
sc.listen(view.host, ['aui-change'], 'view');

choice<Size>(
  sc,
  'Size',
  [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
  ],
  'md',
  (size) => {
    for (const b of all) b.update({ size });
    for (const g of [history, formatting, alignment, view]) g.update({ size });
  },
);
toggle(sc, 'Disabled', false, (disabled) => {
  for (const b of all) b.update({ disabled });
  for (const g of [formatting, alignment, view]) g.update({ disabled });
  history.update({ buttons: [{ icon: 'undo', label: 'Undo', value: 'undo', disabled }, { icon: 'redo', label: 'Redo', value: 'redo', disabled }] });
});
toggle(sc, 'Loading', false, (loading) => {
  for (const b of [save, download]) b.setLoading(loading);
}, ['button']);
toggle(sc, 'Attached groups', true, (attached) => {
  for (const g of [history, formatting, alignment]) g.update({ attached });
}, ['button-group', 'toggle-group']);
