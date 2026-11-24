import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, instant, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  FileManager,
  type FileEntry,
  type FileManagerChangeDetail,
  type FileManagerErrorDetail,
  type FileManagerMoveDetail,
  type FileManagerOpenDetail,
  type FileManagerOptions,
  type FileManagerProvider,
  type FileManagerRenameDetail,
} from '@absoluteui/components/file-manager';

// Unit tests do not load the stylesheets: give the virtualized list the layout rules its CSS would.
const CSS = `
.aui-file-manager { display: flex; flex-direction: column; block-size: var(--_aui-file-manager-height); }
.aui-file-manager__body, .aui-file-manager__content { display: flex; flex-direction: column; flex: 1; min-block-size: 0; }
.aui-file-manager__viewport { position: relative; flex: 1; min-block-size: 200px; overflow: auto; }
.aui-file-manager__canvas { position: relative; block-size: var(--_aui-file-manager-total); }
.aui-file-manager__row { position: absolute; inset-inline: 0; inset-block-start: 0; block-size: var(--_aui-file-manager-row); translate: 0 var(--_aui-file-manager-y); }
[hidden] { display: none !important; }
`;

beforeEach(() => {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  for (const d of document.querySelectorAll('dialog')) d.remove();
  document.body.replaceChildren();
  for (const s of document.head.querySelectorAll('style')) s.remove();
});

const T = instant(Date.UTC(2026, 2, 3, 9, 30));

function seed(): FileEntry[] {
  return [
    { id: 'contracts', name: 'Contracts', kind: 'folder', parentId: null },
    { id: 'policies', name: 'Policies', kind: 'folder', parentId: null, hasChildren: false },
    { id: 'readme', name: 'Readme.md', kind: 'file', size: 1200, mimeType: 'text/markdown', modified: T, parentId: null },
    { id: 'photo', name: 'Badge photo.png', kind: 'file', size: 52000, mimeType: 'image/png', modified: T, parentId: null },
    { id: 'offer', name: 'Offer letter.txt', kind: 'file', size: 2048, modified: T, parentId: 'contracts' },
    { id: 'locked', name: 'Signed.pdf', kind: 'file', size: 99, readOnly: true, parentId: 'contracts' },
  ];
}

interface Memory {
  provider: FileManagerProvider;
  entries: FileEntry[];
  calls: string[];
  failList: Set<string | null>;
}

function memory(): Memory {
  const entries = seed();
  const calls: string[] = [];
  const failList = new Set<string | null>();
  let next = 1;
  const provider: FileManagerProvider = {
    list: async (folderId) => {
      calls.push(`list:${folderId ?? 'root'}`);
      await Promise.resolve();
      if (failList.has(folderId)) throw new Error('offline');
      return entries.filter((e) => e.parentId === folderId);
    },
    createFolder: (parentId, name) => {
      const entry: FileEntry = { id: `new-${String(next++)}`, name, kind: 'folder', parentId };
      entries.push(entry);
      return Promise.resolve(entry);
    },
    rename: (entry, name) => {
      const i = entries.findIndex((e) => e.id === entry.id);
      const renamed = { ...entry, name };
      entries[i] = renamed;
      return Promise.resolve(renamed);
    },
    move: (moved, targetFolderId) => Promise.resolve(moved.map((m) => {
      const i = entries.findIndex((e) => e.id === m.id);
      const updated = { ...m, parentId: targetFolderId };
      entries[i] = updated;
      return updated;
    })),
    delete: (deleted) => {
      for (const d of deleted) entries.splice(entries.findIndex((e) => e.id === d.id), 1);
      return Promise.resolve();
    },
    upload: async (folderId, file, request) => {
      request.onProgress(file.size / 2, file.size);
      await new Promise((r) => setTimeout(r, 20));
      request.onProgress(file.size, file.size);
      const entry: FileEntry = { id: `up-${String(next++)}`, name: file.name, kind: 'file', size: file.size, mimeType: file.type, parentId: folderId };
      entries.push(entry);
      return entry;
    },
    read: () => Promise.resolve('const answer = 42;'),
  };
  return { provider, entries, calls, failList };
}

async function mount(options: Partial<FileManagerOptions> = {}, mem: Memory = memory()): Promise<{ fm: FileManager; mem: Memory }> {
  const host = document.createElement('div');
  document.body.append(host);
  const fm = FileManager.create(host, { label: 'Documents', provider: mem.provider, height: '480px', timezone: 'UTC', locale: 'en-US', ...options });
  await settle(fm);
  return { fm, mem };
}

async function settle(fm: FileManager): Promise<void> {
  for (let i = 0; i < 20 && fm.loading; i++) await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 0));
}

const listbox = (fm: FileManager): HTMLElement => fm.host.querySelector<HTMLElement>('.aui-file-manager__viewport')!;
const option = (fm: FileManager, name: string): HTMLElement => {
  const el = [...fm.host.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.querySelector('.aui-file-manager__name')?.textContent === name);
  if (!el) throw new Error(`no option ${name}`);
  return el;
};
const tool = (fm: FileManager, command: string): HTMLButtonElement => fm.host.querySelector<HTMLButtonElement>(`button[data-command="${command}"]`)!;
const openDialog = (): HTMLDialogElement => {
  const d = [...document.querySelectorAll('dialog')].find((x) => x.open);
  if (!d) throw new Error('no open dialog');
  return d;
};

describe('FileManager', () => {
  it('renders a region, a toolbar, a multi-select listbox sorted with folders first, and a status bar', async () => {
    const { fm } = await mount();
    expect(fm.host.getAttribute('role')).toBe('region');
    expect(fm.host.getAttribute('aria-label')).toBe('Documents');
    expect(fm.host.querySelector('[role="toolbar"]')!.getAttribute('aria-label')).toBe('Documents actions');
    const lb = listbox(fm);
    expect(lb.getAttribute('role')).toBe('listbox');
    expect(lb.getAttribute('aria-multiselectable')).toBe('true');
    expect(fm.entries.map((e) => e.name)).toEqual(['Contracts', 'Policies', 'Badge photo.png', 'Readme.md']);
    expect(option(fm, 'Readme.md').textContent).toContain('1.2 kB');
    expect(option(fm, 'Readme.md').getAttribute('aria-setsize')).toBe('4');
    expect(fm.host.querySelector('[role="status"].aui-file-manager__status')!.textContent).toBe('4 items');
    expect(fm.host.querySelector('[role="tree"]')).not.toBeNull();
  });

  it('rejects invalid options before touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    const provider = memory().provider;
    expect(() => FileManager.create(host, { label: ' ', provider })).toThrow(AbsoluteUIError);
    expect(() => FileManager.create(host, { label: 'Docs', provider: { ...provider, move: undefined } as unknown as FileManagerProvider })).toThrow(/Invalid file manager options/);
    expect(() => FileManager.create(host, { label: 'Docs', provider, height: '10 parsecs' })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
  });

  it('selects with arrows, Shift, Ctrl+A, and click, and reports aui-change', async () => {
    const { fm } = await mount();
    const changes: string[][] = [];
    fm.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<FileManagerChangeDetail>).detail.selected));
    listbox(fm).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(fm.selected).toEqual(['policies']);
    expect(listbox(fm).getAttribute('aria-activedescendant')).toBe(option(fm, 'Policies').id);
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(fm.selected).toEqual(['policies', 'photo']);
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(fm.selected).toHaveLength(4);
    expect(fm.host.querySelector('.aui-file-manager__status')!.textContent).toBe('4 items, 4 selected');
    await userEvent.click(option(fm, 'Readme.md'));
    expect(fm.selected).toEqual(['readme']);
    expect(changes.length).toBeGreaterThanOrEqual(4);
  });

  it('opens folders with Enter, goes up with Backspace, and keeps the path', async () => {
    const { fm, mem } = await mount();
    const navigations: (string | null)[] = [];
    fm.host.addEventListener('aui-navigate', () => {
      navigations.push(fm.currentFolderId);
    });
    listbox(fm).focus();
    await userEvent.keyboard('{Enter}');
    await settle(fm);
    expect(fm.currentFolderId).toBe('contracts');
    expect(fm.path.map((p) => p.label)).toEqual(['Documents', 'Contracts']);
    expect(fm.entries.map((e) => e.name)).toEqual(['Offer letter.txt', 'Signed.pdf']);
    await userEvent.keyboard('{Backspace}');
    await settle(fm);
    expect(fm.currentFolderId).toBeNull();
    // The folder you came from is active again.
    expect(fm.selected).toEqual(['contracts']);
    expect(navigations).toEqual(['contracts', null]);
    expect(mem.calls.filter((c) => c === 'list:root').length).toBeGreaterThanOrEqual(2);
  });

  it('aborts a pending listing when navigating away', async () => {
    const mem = memory();
    const signals: AbortSignal[] = [];
    const slow: FileManagerProvider = { ...mem.provider, list: (folderId, request) => {
      signals.push(request.signal);
      return new Promise((resolve) => setTimeout(() => { resolve(mem.entries.filter((e) => e.parentId === folderId)); }, 50));
    } };
    const host = document.createElement('div');
    document.body.append(host);
    const fm = FileManager.create(host, { label: 'Docs', provider: slow, showFolderPane: false });
    void fm.navigate('contracts');
    expect(signals[0]?.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(fm.entries.map((e) => e.id)).toEqual(['offer', 'locked']);
    fm.destroy();
  });

  it('shows an error state with retry and emits aui-error when listing fails', async () => {
    const mem = memory();
    mem.failList.add(null);
    const host = document.createElement('div');
    document.body.append(host);
    const errors: string[] = [];
    host.addEventListener('aui-error', (e) => errors.push((e as CustomEvent<FileManagerErrorDetail>).detail.operation));
    const fm = FileManager.create(host, { label: 'Docs', provider: mem.provider });
    await settle(fm);
    expect(errors).toEqual(['list']);
    expect(listbox(fm).hidden).toBe(true);
    expect(fm.host.querySelector('.aui-file-manager__state')!.textContent).toContain('Could not load this folder');
    mem.failList.clear();
    await userEvent.click(fm.host.querySelector<HTMLButtonElement>('.aui-file-manager__state button')!);
    await settle(fm);
    expect(fm.entries).toHaveLength(4);
  });

  it('renames with F2 through a validated dialog', async () => {
    const { fm } = await mount();
    const renamed: FileManagerRenameDetail[] = [];
    fm.host.addEventListener('aui-rename', (e) => renamed.push((e as CustomEvent<FileManagerRenameDetail>).detail));
    await userEvent.click(option(fm, 'Readme.md'));
    await userEvent.keyboard('{F2}');
    const dialog = openDialog();
    const input = dialog.querySelector('input')!;
    expect(input.value).toBe('Readme.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'Policies');
    await userEvent.keyboard('{Enter}');
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('already exists');
    await userEvent.clear(input);
    await userEvent.type(input, 'Guide.md{Enter}');
    await new Promise((r) => setTimeout(r, 10));
    expect(renamed[0]?.previousName).toBe('Readme.md');
    expect(renamed[0]?.entry.name).toBe('Guide.md');
    expect(fm.entries.some((e) => e.name === 'Guide.md')).toBe(true);
  });

  it('deletes after confirmation in an alertdialog', async () => {
    const { fm } = await mount();
    await userEvent.click(option(fm, 'Badge photo.png'));
    await userEvent.keyboard('{Delete}');
    const dialog = openDialog();
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    await userEvent.click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!);
    await new Promise((r) => setTimeout(r, 10));
    expect(fm.entries.some((e) => e.id === 'photo')).toBe(false);
  });

  it('moves with cut and paste, refusing read-only entries', async () => {
    const { fm } = await mount();
    const moves: FileManagerMoveDetail[] = [];
    fm.host.addEventListener('aui-move', (e) => moves.push((e as CustomEvent<FileManagerMoveDetail>).detail));
    await userEvent.click(option(fm, 'Readme.md'));
    await userEvent.keyboard('{Control>}x{/Control}');
    expect(option(fm, 'Readme.md').classList.contains('aui-file-manager__item--cut')).toBe(true);
    await fm.navigate('contracts');
    await settle(fm);
    listbox(fm).focus();
    await userEvent.keyboard('{Control>}v{/Control}');
    await new Promise((r) => setTimeout(r, 10));
    expect(moves[0]?.targetFolderId).toBe('contracts');
    expect(moves[0]?.source).toBe('paste');
    expect(fm.entries.map((e) => e.id)).toContain('readme');
    fm.select(['locked']);
    expect(tool(fm, 'cut').disabled).toBe(true);
    expect(tool(fm, 'delete').disabled).toBe(true);
  });

  it('creates a folder with a unique default name', async () => {
    const { fm } = await mount();
    listbox(fm).focus();
    await userEvent.keyboard('{Control>}{Shift>}N{/Shift}{/Control}');
    const dialog = openDialog();
    expect(dialog.querySelector('input')!.value).toBe('New folder');
    await userEvent.keyboard('{Enter}');
    await new Promise((r) => setTimeout(r, 10));
    expect(fm.entries.some((e) => e.kind === 'folder' && e.name === 'New folder')).toBe(true);
    expect(fm.selected).toHaveLength(1);
  });

  it('uploads with progress, validates accept, and emits aui-upload', async () => {
    const { fm } = await mount({ accept: ['.txt'] });
    const uploads: string[] = [];
    fm.host.addEventListener('aui-upload', () => uploads.push('done'));
    fm.upload([new File(['hello'], 'notes.txt', { type: 'text/plain' }), new File(['x'], 'virus.exe')]);
    expect(fm.host.querySelector('.aui-file-manager__message')!.textContent).toContain('virus.exe is not an accepted file type');
    expect(fm.host.querySelectorAll('.aui-file-manager__upload')).toHaveLength(1);
    expect(fm.host.querySelector('.aui-file-manager__upload [role="progressbar"]')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 60));
    expect(uploads).toEqual(['done']);
    expect(fm.entries.some((e) => e.name === 'notes.txt')).toBe(true);
    expect(fm.host.querySelectorAll('.aui-file-manager__upload')).toHaveLength(0);
  });

  it('emits a cancelable aui-open and previews text in a Code Viewer dialog', async () => {
    const { fm } = await mount();
    const opened: string[] = [];
    fm.host.addEventListener('aui-open', (e) => opened.push((e as CustomEvent<FileManagerOpenDetail>).detail.entry.id));
    await userEvent.dblClick(option(fm, 'Readme.md'));
    await new Promise((r) => setTimeout(r, 10));
    expect(opened).toEqual(['readme']);
    const dialog = openDialog();
    expect(dialog.querySelector('.aui-code-viewer')).not.toBeNull();
    expect(dialog.textContent).toContain('answer');
  });

  it('switches to the grid view and moves by columns', async () => {
    const { fm } = await mount({ view: 'grid', showFolderPane: false });
    expect(fm.host.classList.contains('aui-file-manager--grid')).toBe(true);
    await userEvent.click(tool(fm, 'view-list'));
    expect(fm.view).toBe('list');
    expect(tool(fm, 'view-list').getAttribute('aria-pressed')).toBe('true');
    expect(tool(fm, 'view-grid').getAttribute('aria-pressed')).toBe('false');
  });

  it('a click on a view button icon switches the view (regression: the toggle re-renders its icon)', async () => {
    const { fm } = await mount({ view: 'list' });
    const icon = tool(fm, 'view-grid').querySelector('svg')!;
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(icon.isConnected).toBe(false);
    expect(fm.view).toBe('grid');
  });

  it('read-only disables every mutating command', async () => {
    const { fm } = await mount({ readOnly: true });
    for (const c of ['new-folder', 'upload', 'rename', 'delete', 'cut', 'paste']) expect(tool(fm, c).disabled).toBe(true);
    expect(option(fm, 'Readme.md').draggable).toBe(false);
  });

  it('virtualizes a folder of 10,000 entries', async () => {
    const mem = memory();
    for (let i = 0; i < 10_000; i++) mem.entries.push({ id: `bulk-${String(i)}`, name: `Scan ${String(i).padStart(5, '0')}.png`, kind: 'file', size: i, parentId: 'policies' });
    const { fm } = await mount({ showFolderPane: false }, mem);
    await fm.navigate('policies');
    await settle(fm);
    expect(fm.entries).toHaveLength(10_000);
    expect(fm.host.querySelectorAll('[role="option"]').length).toBeLessThan(80);
    listbox(fm).focus();
    await userEvent.keyboard('{End}');
    expect(fm.selected).toEqual(['bulk-9999']);
    expect(option(fm, 'Scan 09999.png').getAttribute('aria-posinset')).toBe('10000');
  });

  it('destroy aborts provider calls and empties the host', async () => {
    const { fm } = await mount();
    fm.destroy();
    expect(fm.host.childElementCount).toBe(0);
    expect(fm.host.classList.contains('aui-file-manager')).toBe(false);
  });
});
