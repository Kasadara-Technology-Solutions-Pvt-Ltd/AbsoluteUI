// R1 feedback, disclosure, layout, and typography page, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Dialog } from '@absoluteui/components/dialog';
import { Alert } from '@absoluteui/components/alert';
import { InlineMessage } from '@absoluteui/components/inline-message';
import { Toaster } from '@absoluteui/components/toast';
import { ProgressBar } from '@absoluteui/components/progress-bar';
import { Spinner } from '@absoluteui/components/spinner';
import { Skeleton } from '@absoluteui/components/skeleton';
import { Accordion } from '@absoluteui/components/accordion';
import { ButtonGroup } from '@absoluteui/components/button-group';
import { Grid, Stack } from '@absoluteui/components/layout';
import { Card } from '@absoluteui/components/card';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });
for (const id of ['alerts', 'progress']) Stack.apply(byId(id), { gap: 3 });
Alert.create(byId('alert-info'), { tone: 'info', title: 'Scheduled maintenance', message: 'The service is read-only on Sunday from 02:00 to 04:00 UTC.', dismissible: true });
Alert.create(byId('alert-error'), { tone: 'error', title: 'Sync failed', message: 'Three records could not be saved.', actions: [{ label: 'Retry', value: 'retry' }] });
InlineMessage.create(byId('inline'), { tone: 'success', message: 'Saved 2 minutes ago' });

const bar = ProgressBar.create(byId('bar'), { label: 'Upload progress', value: 40 });
ProgressBar.create(byId('bar-indeterminate'), { label: 'Preparing export', value: null });
Spinner.create(byId('spinner'), { label: 'Loading activity', showLabel: true });
Skeleton.create(byId('skeleton'), { shape: 'text', lines: 3 });
Skeleton.markBusy(byId('skeleton-region'), true);

const toaster = Toaster.create({ duration: 0 });
const result = byId('last-action');
const group = ButtonGroup.create(byId('group'), {
  label: 'Record actions',
  buttons: [
    { text: 'Notify', value: 'toast' },
    { text: 'Advance', value: 'progress' },
    { text: 'Open dialog', value: 'dialog' },
  ],
});
const dialog = Dialog.create({ title: 'Toasts above dialogs', actions: [{ label: 'Close', value: 'close', autofocus: true }] });
group.element.addEventListener('aui-action', (e) => {
  const value = (e as CustomEvent<{ value: string }>).detail.value;
  result.textContent = value;
  if (value === 'toast') toaster.show({ tone: 'success', title: 'Record saved', message: 'Changes were saved.', action: { label: 'Undo' } });
  if (value === 'progress') bar.setValue(100);
  if (value === 'dialog') dialog.open();
});

Accordion.create(byId('accordion'), {
  items: [
    { id: 'shipping', title: 'Shipping', content: 'Orders ship within two business days.' },
    { id: 'returns', title: 'Returns', content: 'Return unused items within 30 days.' },
    { id: 'warranty', title: 'Warranty', content: 'Two-year limited warranty.', disabled: true },
  ],
  value: ['shipping'],
});

Grid.apply(byId('grid'), { columns: 'auto', minColumnWidth: '14rem', gap: 4 });
Card.create(byId('card-a'), { title: 'Quarterly report', subtitle: 'Finance', content: 'Revenue grew 12% quarter over quarter.', interactive: { href: '#cards' } });
Card.create(byId('card-b'), { title: 'Team', subtitle: 'People', content: '14 members across 3 time zones.', variant: 'raised' });
Card.create(byId('card-c'), { content: 'A card without a title renders as a plain surface.', variant: 'sunken' });

Object.assign(window, { __auiReady: true });
