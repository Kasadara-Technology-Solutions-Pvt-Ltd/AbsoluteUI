import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { FileUpload, type FileUploadChangeDetail, type FileUploadOptions, type FileUploadRejectDetail } from '@absoluteui/components/file-upload';
import { Form } from '@absoluteui/components/form';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<FileUploadOptions> = {}, parent: HTMLElement = document.body): FileUpload {
  const host = document.createElement('div');
  parent.append(host);
  return FileUpload.create(host, { label: 'Attachments', ...options });
}

const file = (name: string, size = 10, type = ''): File => new File([new Uint8Array(size)], name, { type, lastModified: 1_700_000_000_000 });
const names = (u: FileUpload): string[] => u.value.map((f) => f.name);
const describedBy = (el: Element): string[] => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);
const liveText = (): string => document.querySelector('[data-aui-live-region="polite"]')?.textContent ?? '';
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { r(); })));

/** Dispatch a drop of `files` on the zone (DataTransfer built like a real drag). */
function drop(u: FileUpload, files: File[]): DragEvent {
  const zone = u.host.querySelector<HTMLElement>('.aui-file-upload__zone')!;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  zone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
  const event = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
  zone.dispatchEvent(event);
  return event;
}

describe('FileUpload: semantics', () => {
  it('renders a labelled chooser button with hints; the native input is hidden and not a tab stop', () => {
    const u = mount({ multiple: true, required: true, description: 'PDF only', acceptExtensions: ['.pdf'], maxFileSize: 5_000_000, maxFiles: 3, name: 'docs' });
    const button = u.button;
    expect(button.type).toBe('button');
    const labelled = button.getAttribute('aria-labelledby')!.split(' ').map((id) => document.getElementById(id)!.textContent);
    expect(labelled).toEqual(['Attachments*', 'Choose files']);
    expect(describedBy(button)).toEqual(['PDF only', 'Allowed file types: .pdf. Maximum 5 MB per file. Up to 3 files.', 'Required']);
    expect(u.input.hidden).toBe(true);
    expect(u.input.tabIndex).toBe(-1);
    expect(u.input.multiple).toBe(true);
    expect(u.input.accept).toBe('.pdf');
    expect(u.input.name).toBe('docs');
    expect(u.host.querySelector('.aui-file-upload__prompt')!.textContent).toBe('Drag files here or');
    expect(getFormControl(u.host)).toBe(u);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => FileUpload.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => FileUpload.create(host, { label: 'x', acceptTypes: ['pdf'] })).toThrow(/acceptTypes/);
    expect(() => FileUpload.create(host, { label: 'x', acceptExtensions: ['pdf'] })).toThrow(/acceptExtensions/);
    expect(() => FileUpload.create(host, { label: 'x', maxFileSize: 0 })).toThrow(/maxFileSize/);
    expect(() => FileUpload.create(host, { label: 'x', maxFiles: 2 })).toThrow(/multiple/);
    expect(host.childElementCount).toBe(0);
  });

  it('hides the drop zone chrome when dropZone is false (global config)', () => {
    configureAbsoluteUI({ components: { fileUpload: { dropZone: false } } });
    const u = mount();
    expect(u.host.classList.contains('aui-file-upload--no-zone')).toBe(true);
    expect(u.host.querySelector<HTMLElement>('.aui-file-upload__prompt')!.hidden).toBe(true);
  });
});

describe('FileUpload: selection', () => {
  it('adds files chosen through the native input and lists them with remove buttons', async () => {
    const u = mount({ multiple: true });
    const changes: FileUploadChangeDetail[] = [];
    u.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<FileUploadChangeDetail>).detail));
    await userEvent.upload(u.input, [file('a.txt'), file('b.txt')]);
    expect(names(u)).toEqual(['a.txt', 'b.txt']);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.added.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    const items = u.host.querySelectorAll('.aui-file-upload__item');
    expect(items).toHaveLength(2);
    expect(items[0]!.querySelector('.aui-file-upload__name')!.textContent).toBe('a.txt');
    expect(items[0]!.querySelector('button')!.getAttribute('aria-label')).toBe('Remove a.txt');
    // A second selection appends; the same file (name, size, modification time) again is ignored.
    // (Dropped: the test driver's upload stamps a new modification time on every call.)
    drop(u, [new File([new Uint8Array(10)], 'a.txt', { lastModified: u.value[0]!.lastModified }), file('c.txt')]);
    expect(names(u)).toEqual(['a.txt', 'b.txt', 'c.txt']);
    // The native input mirrors the full selection (native form submission).
    expect(Array.from(u.input.files ?? []).map((f) => f.name)).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('single mode replaces the file', async () => {
    const u = mount();
    await userEvent.upload(u.input, file('one.txt'));
    await userEvent.upload(u.input, file('two.txt'));
    expect(names(u)).toEqual(['two.txt']);
  });

  it('rejects files by MIME type and extension (both checked when both are set), size, count, and total', async () => {
    const u = mount({ multiple: true, acceptTypes: ['image/*'], acceptExtensions: ['.png', '.jpg'], maxFileSize: 1000, maxFiles: 2, maxTotalSize: 1500 });
    const rejects: FileUploadRejectDetail[] = [];
    u.host.addEventListener('aui-reject', (e) => rejects.push((e as CustomEvent<FileUploadRejectDetail>).detail));
    await userEvent.upload(u.input, [
      file('ok.png', 800, 'image/png'),
      // Right extension, wrong MIME type: never trust one signal alone.
      file('fake.png', 10, 'application/x-msdownload'),
      file('photo.gif', 10, 'image/gif'),
      file('big.jpg', 2000, 'image/jpeg'),
      file('second.jpg', 800, 'image/jpeg'),
      file('third.png', 10, 'image/png'),
    ]);
    // third.png still fits the count and total limits after second.jpg was rejected.
    expect(names(u)).toEqual(['ok.png', 'third.png']);
    expect(rejects[0]!.rejected.map((r) => `${r.file.name}:${r.reason}`)).toEqual(['fake.png:file-type', 'photo.gif:file-type', 'big.jpg:file-too-large', 'second.jpg:total-too-large']);
    const shown = Array.from(u.host.querySelectorAll('.aui-file-upload__rejection-list li')).map((li) => li.textContent);
    expect(shown[0]).toBe('fake.png: This file type is not allowed.');
    expect(shown[2]).toBe('big.jpg: The file is larger than 1 kB.');
    expect(describedBy(u.button).at(-1)).toContain('fake.png: This file type is not allowed.');
    expect(u.validity.valid).toBe(true);
    await nextFrame();
    expect(liveText()).toBe('4 files were not added.');
  });

  it('rejects files over the count limit in selection order', async () => {
    const u = mount({ multiple: true, maxFiles: 2 });
    await userEvent.upload(u.input, [file('a'), file('b'), file('c')]);
    expect(names(u)).toEqual(['a', 'b']);
    expect(u.rejections.map((r) => [r.file.name, r.message])).toEqual([['c', 'You can select up to 2 files.']]);
    await nextFrame();
    expect(liveText()).toBe('c was not added. You can select up to 2 files.');
  });

  it('removing a file moves focus to the next remove button, then to the chooser, and announces', async () => {
    const u = mount({ multiple: true });
    await userEvent.upload(u.input, [file('a'), file('b')]);
    const removes = (): HTMLButtonElement[] => Array.from(u.host.querySelectorAll<HTMLButtonElement>('.aui-file-upload__remove'));
    await userEvent.click(removes()[0]!);
    expect(names(u)).toEqual(['b']);
    expect(document.activeElement).toBe(removes()[0]);
    await nextFrame();
    expect(liveText()).toBe('a removed');
    await userEvent.keyboard('{Enter}');
    expect(names(u)).toEqual([]);
    expect(document.activeElement).toBe(u.button);
    expect(u.host.querySelector<HTMLElement>('.aui-file-upload__list')!.hidden).toBe(true);
  });

  it('the chooser button opens the native picker from the keyboard', async () => {
    const u = mount();
    let opened = 0;
    u.input.addEventListener('click', (e) => {
      opened++;
      // Do not actually open the OS dialog in the test.
      e.preventDefault();
    });
    u.button.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(opened).toBe(2);
  });
});

describe('FileUpload: drag and drop', () => {
  it('accepts dropped files, prevents navigation, and highlights while dragging', () => {
    const u = mount({ multiple: true, acceptExtensions: ['.txt'] });
    const zone = u.host.querySelector<HTMLElement>('.aui-file-upload__zone')!;
    const dt = new DataTransfer();
    dt.items.add(file('drag.txt'));
    const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    zone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    zone.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(u.host.classList.contains('aui-file-upload--dragover')).toBe(true);
    const event = drop(u, [file('drag.txt'), file('evil.exe')]);
    expect(event.defaultPrevented).toBe(true);
    expect(u.host.classList.contains('aui-file-upload--dragover')).toBe(false);
    expect(names(u)).toEqual(['drag.txt']);
    expect(u.rejections.map((r) => r.reason)).toEqual(['file-type']);
    expect(document.activeElement).toBe(u.button);
  });

  it('ignores drops while disabled (but still prevents navigation)', () => {
    const u = mount({ disabled: true });
    const event = drop(u, [file('a.txt')]);
    expect(event.defaultPrevented).toBe(true);
    expect(names(u)).toEqual([]);
    expect(u.button.disabled).toBe(true);
  });

  it('single mode takes the first dropped file and rejects the rest', () => {
    const u = mount();
    drop(u, [file('first.txt'), file('second.txt')]);
    expect(names(u)).toEqual(['first.txt']);
    expect(u.rejections.map((r) => [r.file.name, r.message])).toEqual([['second.txt', 'You can select only 1 file.']]);
  });
});

describe('FileUpload: validation and forms', () => {
  it('required shows a message after blur; value-level rule violations from setValue are reported', async () => {
    const u = mount({ required: true, multiple: true });
    expect(u.validity).toMatchObject({ valid: false, error: 'value-missing', message: 'Select at least one file.' });
    u.button.focus();
    await userEvent.tab();
    expect(describedBy(u.button)).toContain('Select at least one file.');
    u.update({ maxFileSize: 5 });
    u.setValue([file('big.txt', 50)]);
    expect(u.validity).toMatchObject({ valid: false, error: 'file-too-large', message: 'Each file must be 5 byte or smaller.' });
    expect(u.host.querySelector('.aui-file-upload__issue')!.textContent).toBe('The file is larger than 5 byte.');
  });

  it('runs the consumer validator and custom errors', async () => {
    const u = mount({ multiple: true, validate: (files) => (files.length === 1 ? 'Add a second file.' : null) });
    await userEvent.upload(u.input, file('a'));
    expect(u.validity).toMatchObject({ error: 'custom', message: 'Add a second file.' });
    u.setCustomError('Server says no.');
    await userEvent.upload(u.input, file('b'));
    // A new selection clears the external error.
    expect(u.validity.valid).toBe(true);
  });

  it('serializes to File[] in Form.getValues and resets to the initial files', async () => {
    const form = document.createElement('form');
    document.body.append(form);
    const initial = file('initial.txt');
    const u = mount({ name: 'files', multiple: true, value: [initial] }, form);
    const f = Form.create(form);
    await userEvent.upload(u.input, file('added.txt'));
    const values = f.getValues();
    expect(Array.isArray(values.files)).toBe(true);
    expect((values.files as File[]).map((x) => x.name)).toEqual(['initial.txt', 'added.txt']);
    // FormData from the native form includes the same files.
    expect(new FormData(form).getAll('files').map((x) => (x as File).name)).toEqual(['initial.txt', 'added.txt']);
    expect(u.dirty).toBe(true);
    f.reset();
    expect(names(u)).toEqual(['initial.txt']);
    expect(u.dirty).toBe(false);
    f.destroy();
  });

  it('formats sizes with the locale', () => {
    const u = mount({ maxFileSize: 2_500_000, locale: 'de-DE' });
    expect(u.host.querySelector('.aui-file-upload__hint')!.textContent).toBe('Maximum 2,5 MB per file.');
  });

  it('never renders file names as HTML (regression guard)', async () => {
    const u = mount();
    await userEvent.upload(u.input, file('<img src=x onerror=alert(1)>.txt'));
    expect(u.host.querySelector('img')).toBeNull();
    expect(u.host.querySelector('.aui-file-upload__name')!.textContent).toBe('<img src=x onerror=alert(1)>.txt');
  });

  it('destroy removes rendering and registration', () => {
    const u = mount();
    u.destroy();
    expect(u.host.childElementCount).toBe(0);
    expect(getFormControl(u.host)).toBeUndefined();
  });
});
