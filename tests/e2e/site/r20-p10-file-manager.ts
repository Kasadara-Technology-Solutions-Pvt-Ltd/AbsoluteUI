// R20 P10 page: File Manager over an in-memory provider with delays (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI, instant } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { FileManager, type FileEntry, type FileManagerErrorDetail, type FileManagerMoveDetail, type FileManagerProvider, type FileManagerRenameDetail, type FileManagerUploadDetail } from '@absoluteui/components/file-manager';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'UTC' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const wait = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

const at = (day: number): ReturnType<typeof instant> => instant(Date.UTC(2026, 2, day, 9, 30));

/** A 2x2 PNG as a blob: URL, drawn at runtime (no files needed). */
function pngUrl(color: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 48);
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : '');
    }, 'image/png');
  });
}

const entries: FileEntry[] = [
  { id: 'contracts', name: 'Contracts', kind: 'folder', parentId: null, modified: at(2) },
  { id: 'policies', name: 'Policies', kind: 'folder', parentId: null, modified: at(1) },
  { id: 'archive', name: 'Archive', kind: 'folder', parentId: null, hasChildren: false },
  { id: 'broken', name: 'Broken folder', kind: 'folder', parentId: null, hasChildren: false },
  { id: 'handbook', name: 'Handbook.md', kind: 'file', size: 18_200, mimeType: 'text/markdown', modified: at(5), parentId: null },
  { id: 'badge', name: 'Badge photo.png', kind: 'file', size: 52_400, mimeType: 'image/png', modified: at(6), parentId: null },
  { id: 'export', name: 'Employees export.json', kind: 'file', size: 4_100, mimeType: 'application/json', modified: at(7), parentId: null },
  { id: 'offer', name: 'Offer letter.txt', kind: 'file', size: 2_048, modified: at(3), parentId: 'contracts' },
  { id: 'signed', name: 'Signed contract.pdf', kind: 'file', size: 310_000, mimeType: 'application/pdf', readOnly: true, parentId: 'contracts' },
  { id: 'leave', name: 'Leave policy.md', kind: 'file', size: 9_000, mimeType: 'text/markdown', parentId: 'policies' },
];
const texts: Record<string, string> = {
  handbook: '# Handbook\n\nWelcome to the company. Read the **leave policy** first.',
  export: '[\n  { "id": 1, "name": "Ada Lovelace" }\n]',
  offer: 'Dear Ada,\nWe are pleased to offer you the position.',
  leave: '## Leave\n\n25 days per year.',
};
let next = 1;
const log = byId('fm-log');

const provider: FileManagerProvider = {
  async list(folderId, { signal }) {
    await wait(120, signal);
    if (folderId === 'broken') throw new Error('server error');
    return entries.filter((e) => e.parentId === folderId);
  },
  async createFolder(parentId, name, { signal }) {
    await wait(80, signal);
    const entry: FileEntry = { id: `folder-${String(next++)}`, name, kind: 'folder', parentId, hasChildren: false, modified: at(9) };
    entries.push(entry);
    return entry;
  },
  async rename(entry, name, { signal }) {
    await wait(80, signal);
    const i = entries.findIndex((e) => e.id === entry.id);
    const renamed = { ...entry, name };
    entries[i] = renamed;
    return renamed;
  },
  async move(moved, targetFolderId, { signal }) {
    await wait(80, signal);
    return moved.map((m) => {
      const i = entries.findIndex((e) => e.id === m.id);
      const updated = { ...m, parentId: targetFolderId };
      entries[i] = updated;
      return updated;
    });
  },
  async delete(deleted, { signal }) {
    await wait(80, signal);
    for (const d of deleted) entries.splice(entries.findIndex((e) => e.id === d.id), 1);
  },
  async upload(folderId, file, { signal, onProgress }) {
    for (let step = 1; step <= 4; step++) {
      await wait(150, signal);
      onProgress((file.size * step) / 4, file.size);
    }
    if (file.name.startsWith('fail')) throw new Error('quota exceeded');
    const entry: FileEntry = { id: `upload-${String(next++)}`, name: file.name, kind: 'file', size: file.size, mimeType: file.type, parentId: folderId, modified: at(10) };
    entries.push(entry);
    return entry;
  },
  async getUrl(entry, { signal }) {
    await wait(20, signal);
    return pngUrl(entry.id === 'badge' ? '#2563eb' : '#15803d');
  },
  async read(entry, { signal }) {
    await wait(20, signal);
    return texts[entry.id] ?? '';
  },
};

const host = byId('fm');
const fm = FileManager.create(host, { label: 'Company documents', provider, root: { id: null, label: 'Documents' }, height: '30rem', maxFileSize: 5_000_000 });
host.addEventListener('aui-rename', (e) => {
  const d = (e as CustomEvent<FileManagerRenameDetail>).detail;
  log.textContent = `Renamed ${d.previousName} to ${d.entry.name}`;
});
host.addEventListener('aui-move', (e) => {
  const d = (e as CustomEvent<FileManagerMoveDetail>).detail;
  log.textContent = `Moved ${d.entries.map((x) => x.name).join(', ')} to ${d.targetFolderId ?? 'root'} by ${d.source}`;
});
host.addEventListener('aui-delete', () => {
  log.textContent = 'Deleted';
});
host.addEventListener('aui-upload', (e) => {
  log.textContent = `Uploaded ${(e as CustomEvent<FileManagerUploadDetail>).detail.file.name}`;
});
host.addEventListener('aui-error', (e) => {
  log.textContent = `Error: ${(e as CustomEvent<FileManagerErrorDetail>).detail.operation}`;
});

// A large read-only folder in the grid view.
const scans: FileEntry[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `scan-${String(i)}`, name: `Scan ${String(i).padStart(5, '0')}.png`, kind: 'file', size: 40_000 + i, mimeType: 'image/png', parentId: null }));
const big = FileManager.create(byId('fm-big'), {
  label: 'Scans',
  view: 'grid',
  readOnly: true,
  showFolderPane: false,
  height: '24rem',
  provider: { ...provider, list: async (_folderId, { signal }) => {
    await wait(50, signal);
    return scans;
  } },
});

Object.assign(window, { __auiReady: true, __fm: fm, __big: big });
