import { instant } from '@absoluteui/core';
import { FileManager, type FileEntry, type FileManagerOptions, type FileManagerProvider } from '@absoluteui/components/file-manager';
import { host, seed } from '../seed.js';

const at = (day: number): ReturnType<typeof instant> => instant(Date.UTC(2026, 2, day, 9, 30));
const delay = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

/** A simulated in-memory provider: listings and operations resolve after a short delay. */
function simulatedProvider(): FileManagerProvider {
  const entries: FileEntry[] = [
    { id: 'contracts', name: 'Contracts', kind: 'folder', parentId: null, modified: at(2) },
    { id: 'policies', name: 'Policies', kind: 'folder', parentId: null, modified: at(1) },
    { id: 'handbook', name: 'Handbook.md', kind: 'file', size: 18_200, mimeType: 'text/markdown', modified: at(5), parentId: null },
    { id: 'export', name: 'Employees export.json', kind: 'file', size: 4_100, mimeType: 'application/json', modified: at(7), parentId: null },
    { id: 'offer', name: 'Offer letter.txt', kind: 'file', size: 2_048, modified: at(3), parentId: 'contracts' },
    { id: 'leave', name: 'Leave policy.md', kind: 'file', size: 9_000, mimeType: 'text/markdown', modified: at(4), parentId: 'policies' },
  ];
  const texts: Record<string, string> = {
    handbook: '# Handbook\n\nWelcome. Read the **leave policy** first.',
    export: '[\n  { "id": 1, "name": "Ada Lovelace", "department": "Engineering" }\n]',
    offer: 'Dear Ada,\nWe are pleased to offer you the position.',
    leave: '## Leave\n\n25 days per year, plus public holidays.',
  };
  let next = 1;
  return {
    async list(folderId, { signal }) {
      await delay(150, signal);
      return entries.filter((e) => e.parentId === folderId);
    },
    async createFolder(parentId, name, { signal }) {
      await delay(100, signal);
      const entry: FileEntry = { id: `folder-${String(next++)}`, name, kind: 'folder', parentId, hasChildren: false };
      entries.push(entry);
      return entry;
    },
    async rename(entry, name, { signal }) {
      await delay(100, signal);
      const renamed = { ...entry, name };
      entries[entries.findIndex((e) => e.id === entry.id)] = renamed;
      return renamed;
    },
    async move(moved, targetFolderId, { signal }) {
      await delay(100, signal);
      return moved.map((m) => {
        const updated = { ...m, parentId: targetFolderId };
        entries[entries.findIndex((e) => e.id === m.id)] = updated;
        return updated;
      });
    },
    async delete(deleted, { signal }) {
      await delay(100, signal);
      for (const d of deleted) entries.splice(entries.findIndex((e) => e.id === d.id), 1);
    },
    async upload(folderId, file, { signal, onProgress }) {
      for (let step = 1; step <= 5; step++) {
        await delay(200, signal);
        onProgress((file.size * step) / 5, file.size);
      }
      const entry: FileEntry = { id: `upload-${String(next++)}`, name: file.name, kind: 'file', size: file.size, mimeType: file.type, parentId: folderId };
      entries.push(entry);
      return entry;
    },
    async read(entry, { signal }) {
      await delay(50, signal);
      return texts[entry.id] ?? '';
    },
  };
}

export default seed<FileManagerOptions>({
  options: { label: 'Employee documents', provider: simulatedProvider(), root: { id: null, label: 'Documents' }, height: '26rem' },
  call: 'FileManager.create(host, $)',
  codeValues: { provider: 'documentsProvider' },
  hide: ['provider'],
  note: 'Simulated provider: double-click a folder to open it, a text file to preview it; try F2, Delete, Ctrl+X and Ctrl+V.',
  mount(stage, options) {
    const h = host(stage);
    const c = FileManager.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
