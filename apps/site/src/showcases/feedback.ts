// Feedback showcase: a status center with alerts, inline messages, toasts, a progress bar
// driven by a simulated job, spinners, and skeletons while content loads.
import { Alert } from '@absoluteui/components/alert';
import { Button } from '@absoluteui/components/button';
import { InlineMessage } from '@absoluteui/components/inline-message';
import { ProgressBar } from '@absoluteui/components/progress-bar';
import { Skeleton } from '@absoluteui/components/skeleton';
import { Spinner } from '@absoluteui/components/spinner';
import { Toaster, toast } from '@absoluteui/components/toast';
import { action, choice, createShowcase, hostIn, section, toggle, wait } from './kit.js';

type Tone = 'info' | 'success' | 'warning' | 'error';

const sc = createShowcase({
  title: 'Status center',
  description: 'Alerts, inline messages, toasts, progress, spinners, and skeletons, each with the right live-region behavior.',
});

Toaster.create({ position: 'bottom-end', max: 3, duration: 5000 });
let tone: Tone = 'info';

const alerts = section(sc, 'Alerts', ['alert']);
const alert = Alert.create(hostIn(alerts), {
  tone: 'warning',
  title: 'Payroll closes Friday',
  message: 'Approve all timesheets by Thursday 17:00 to include them in this month.',
  dismissible: true,
  actions: [{ label: 'Review timesheets', value: 'review', variant: 'primary' }, { label: 'Remind me later', value: 'later' }],
});
sc.listen(alert.host, ['aui-action', 'aui-dismiss'], 'alert');

const inline = section(sc, 'Inline messages', ['inline-message']);
(['info', 'success', 'warning', 'error'] as const).forEach((t) =>
  InlineMessage.create(hostIn(inline), { tone: t, message: { info: 'Changes are saved automatically.', success: 'Profile updated.', warning: 'Your certificate expires in 12 days.', error: 'The export failed. Try again.' }[t] }),
);

const progressSection = section(sc, 'Progress', ['progress-bar']);
const bar = ProgressBar.create(hostIn(progressSection), { label: 'Exporting 1,200 records', value: 0, max: 100, showValue: true, announceComplete: true, description: 'You can keep working while the export runs.' });
ProgressBar.create(hostIn(progressSection), { label: 'Connecting to the bank', value: null });
const spinnerSection = section(sc, 'Spinners', ['spinner']);
const spinners = hostIn(spinnerSection);
spinners.className = 'sc-row';
(['sm', 'md', 'lg'] as const).map((size) => Spinner.create(hostIn(spinners), { size, label: `Loading (${size})`, showLabel: size === 'lg' }));

const loading = section(sc, 'Loading content', ['skeleton']);
const card = hostIn(loading);
card.className = 'sc-skeleton-card';
const skeletons = [Skeleton.create(hostIn(card), { shape: 'circle', width: '3rem', height: '3rem' }), Skeleton.create(hostIn(card), { lines: 3 })];
Skeleton.markBusy(card, true);

const toasts = section(sc, 'Toasts', ['toast']);
const toastIntro = document.createElement('p');
toastIntro.textContent = 'Toasts appear at the bottom end of the page, at most three at a time, and close after five seconds. Choose the tone in the options; Run export ends with a toast that has an action.';
toasts.append(toastIntro);
const toastRow = hostIn(toasts);
toastRow.className = 'sc-row';
const showToast = Button.create({ text: 'Show toast', variant: 'secondary' }, document);
toastRow.append(showToast.element);

const runExport = async (): Promise<void> => {
  bar.update({ tone: 'default' });
  for (let v = 0; v <= 100; v += 10) {
    bar.setValue(v);
    await wait(250);
  }
  bar.update({ tone: 'success' });
  toast({ tone: 'success', title: 'Export ready', message: 'export-2026-11.csv is ready to download.', action: { label: 'Download', onAction: () => { sc.log('toast action: download'); } } });
  sc.log('export finished');
};

action(
  sc,
  'Run export',
  () => {
    void runExport();
  },
  ['progress-bar', 'toast'],
);
showToast.element.addEventListener('click', () => {
  toast({ tone, message: { info: 'Three people joined your team.', success: 'Settings saved.', warning: 'You are offline. Changes will sync later.', error: 'Could not reach the server.' }[tone] });
  sc.log('toast shown', { tone });
});
action(sc, 'Show alert again', () => {
  alert.update({ title: 'Payroll closes Friday' });
  if (!alert.host.isConnected || alert.host.hidden) alerts.append(alert.host);
  alert.host.hidden = false;
}, ['alert']);
choice<Tone>(
  sc,
  'Toast tone',
  [
    { value: 'info', label: 'Info' },
    { value: 'success', label: 'Success' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' },
  ],
  'info',
  (t) => {
    tone = t;
  },
  ['toast'],
);
toggle(sc, 'Content loaded', false, (loaded) => {
  Skeleton.markBusy(card, !loaded);
  if (loaded) {
    for (const s of skeletons) s.destroy();
    card.textContent = 'Ada Lovelace, Engineering lead. 12 open reviews.';
  }
}, ['skeleton']);
