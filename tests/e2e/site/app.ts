// Demo app bundled against the built packages (package "exports").
import { configureAbsoluteUI, parseInstant, plainDate, setSanitizedHtml } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { Dialog, type DialogCloseDetail } from '@absoluteui/components/dialog';
import { Combobox } from '@absoluteui/components/combobox';
import { DateInput } from '@absoluteui/components/date-input';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'America/New_York' });
startThemeRuntime();

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`missing #${id}`);
  return el;
}

Button.enhance(byId('btn-primary', HTMLButtonElement), { variant: 'primary' });
Button.enhance(byId('btn-secondary', HTMLButtonElement));
Button.enhance(byId('btn-ghost', HTMLButtonElement), { variant: 'ghost' });
Button.enhance(byId('btn-danger', HTMLButtonElement), { variant: 'danger', icon: 'close' });
Button.enhance(byId('btn-loading', HTMLButtonElement), { variant: 'primary', loading: true });
Button.enhance(byId('btn-icon', HTMLButtonElement), { icon: 'search', label: 'Search' });
Button.enhance(byId('btn-disabled', HTMLButtonElement));

Combobox.create(byId('combobox-host', HTMLDivElement), {
  label: 'Country',
  name: 'country',
  description: 'Type to filter.',
  options: [
    { value: 'in', label: 'India' },
    { value: 'jp', label: 'Japan' },
    { value: 'de', label: 'Germany' },
    { value: 'fr', label: 'France' },
    { value: 'us', label: 'United States' },
    { value: 'gb', label: 'United Kingdom' },
    { value: 'xx', label: 'Unavailable region', disabled: true },
  ],
});

const dialog = Dialog.create({
  title: 'Choose a country',
  description: 'The selection is saved to your profile.',
  actions: [
    { label: 'Cancel', value: 'cancel', autofocus: true },
    { label: 'Save', value: 'save', variant: 'primary' },
  ],
});
const dialogHost = document.createElement('div');
dialog.body.append(dialogHost);
Combobox.create(dialogHost, { label: 'Country in dialog', options: [{ value: 'in', label: 'India' }, { value: 'jp', label: 'Japan' }] });
dialog.element.addEventListener('aui-close', (e) => {
  byId('dialog-result', HTMLOutputElement).textContent = (e as CustomEvent<DialogCloseDetail>).detail.returnValue || 'dismissed';
});
byId('open-dialog', HTMLButtonElement).addEventListener('click', () => {
  dialog.open();
});

DateInput.create(byId('date-host', HTMLDivElement), { label: 'Start date', name: 'start', min: plainDate(2026, 1, 1), value: plainDate(2026, 3, 8) });
DateInput.create(byId('datetime-host', HTMLDivElement), { label: 'Meeting time', name: 'meeting', granularity: 'minute', value: parseInstant('2026-03-08T12:00:00Z') });

// Untrusted HTML through the sanitizer while Trusted Types are enforced.
setSanitizedHtml(
  byId('sanitized', HTMLDivElement),
  '<p>Hello <strong>world</strong><img src=x onerror="window.__xss=1"><a href="javascript:window.__xss=2">link</a></p>',
);

// Exposed for the performance spec only (harness code, not library API).
Object.assign(window, { __auiReady: true, __aui: { Button, Combobox, Dialog, DateInput } });
