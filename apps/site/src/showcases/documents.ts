// Documents showcase: a document center over a simulated provider. The File Manager
// browses folders (list or grid, sort, multi-select, rename, new folder, delete, move by drag or
// cut and paste, uploads with progress); opening a photo shows it in the Image Viewer (zoom,
// rotate, crop to a Blob); opening a text or code file shows it in the Code Viewer with a diff
// against its previous version; every change is added to the Timeline of document activity; and
// a Tour walks through the page.
import { instant, type Instant } from '@absoluteui/core';
import { CodeViewer, type CodeLanguage } from '@absoluteui/components/code-viewer';
import {
  FileManager,
  type FileEntry,
  type FileManagerCreateFolderDetail,
  type FileManagerDeleteDetail,
  type FileManagerErrorDetail,
  type FileManagerMoveDetail,
  type FileManagerOpenDetail,
  type FileManagerProvider,
  type FileManagerRenameDetail,
  type FileManagerUploadDetail,
} from '@absoluteui/components/file-manager';
import { ImageViewer, type ImageViewerImage } from '@absoluteui/components/image-viewer';
import { Timeline, type TimelineActionDetail, type TimelineItem, type TimelineTone } from '@absoluteui/components/timeline';
import { Tour } from '@absoluteui/components/tour';
import { action, choice, createShowcase, hostIn, section, status, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Document center',
  description: 'Browse company documents, preview photos and files, compare versions, follow the activity, and take the guided tour.',
  simulated: true,
});

// Simulated storage: entries, text contents with a previous version, and generated photos.
const HOUR = 3_600_000;
const now = Date.now();
const ago = (hours: number): Instant => instant(now - hours * HOUR);

function photo(color: string, label: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(320, 170, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(190, 270, 260, 90);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 320, 325);
  }
  return canvas.toDataURL('image/png');
}

interface Stored {
  entry: FileEntry;
  text?: string;
  previous?: string;
  url?: string;
}

const store = new Map<string, Stored>();
let nextId = 1;
function put(entry: Omit<FileEntry, 'id'> & { id?: string }, extra: Omit<Stored, 'entry'> = {}): FileEntry {
  const id = entry.id ?? `f${String(nextId++)}`;
  const full: FileEntry = { ...entry, id };
  store.set(id, { entry: full, ...extra });
  return full;
}

const policyBefore = '{\n  "policy": "Annual leave",\n  "annualDays": 25,\n  "carryOverDays": 5,\n  "approval": "manager"\n}\n';
const policyAfter = '{\n  "policy": "Annual leave",\n  "annualDays": 26,\n  "carryOverDays": 5,\n  "halfDays": true,\n  "approval": ["manager", "hr"]\n}\n';
const exportBefore = "export async function exportEmployees(limit = 100): Promise<string> {\n  const response = await fetch(`/api/employees?limit=${String(limit)}`);\n  return JSON.stringify(await response.json());\n}\n";
const exportAfter = "/** Export employees as indented JSON; business days only (see the payroll calendar). */\nexport async function exportEmployees(limit = 100, signal?: AbortSignal): Promise<string> {\n  const response = await fetch(`/api/employees?limit=${String(limit)}`, { signal });\n  if (!response.ok) throw new Error(`Export failed: ${String(response.status)}`);\n  return JSON.stringify(await response.json(), null, 2);\n}\n";
const handbook = '# Employee handbook\n\nWelcome to the company. Read the **leave policy** first.\n\n## Working hours\n\n- Core hours: 10:00 to 16:00\n- Public holidays follow the `business calendar`\n';
const handbookBefore = '# Employee handbook\n\nWelcome to the company.\n\n## Working hours\n\n- Core hours: 10:00 to 15:00\n';

put({ id: 'policies', name: 'Policies', kind: 'folder', parentId: null, hasChildren: true, modified: ago(30) });
put({ id: 'photos', name: 'Badge photos', kind: 'folder', parentId: null, hasChildren: false, modified: ago(50) });
put({ id: 'scripts', name: 'Scripts', kind: 'folder', parentId: null, hasChildren: false, modified: ago(70) });
put({ id: 'archive', name: 'Archive', kind: 'folder', parentId: null, hasChildren: false, modified: ago(900) });
put({ name: 'Employee handbook.md', kind: 'file', parentId: null, size: 18_240, mimeType: 'text/markdown', modified: ago(5) }, { text: handbook, previous: handbookBefore });
put({ id: 'leave-policy', name: 'leave-policy.json', kind: 'file', parentId: 'policies', size: 1_204, mimeType: 'application/json', modified: ago(2) }, { text: policyAfter, previous: policyBefore });
put({ name: 'travel-policy.md', kind: 'file', parentId: 'policies', size: 9_870, mimeType: 'text/markdown', modified: ago(120) }, { text: '# Travel policy\n\nBook economy for flights under six hours.\n' });
put({ id: 'remote', name: 'Remote work', kind: 'folder', parentId: 'policies', hasChildren: false, modified: ago(200) });
put({ name: 'export-employees.ts', kind: 'file', parentId: 'scripts', size: 2_310, mimeType: 'text/typescript', modified: ago(26) }, { text: exportAfter, previous: exportBefore });
put({ name: 'monthly-report.sql', kind: 'file', parentId: 'scripts', size: 640, mimeType: 'application/sql', modified: ago(300) }, { text: "SELECT department, COUNT(*) AS headcount\nFROM employees\nWHERE status = 'active'\nGROUP BY department\nORDER BY headcount DESC;\n" });
const PEOPLE: readonly [string, string][] = [
  ['Ada Lovelace', '#1d4ed8'],
  ['Grace Hopper', '#15803d'],
  ['Alan Turing', '#b45309'],
  ['Katherine Johnson', '#7c3aed'],
];
for (const [index, [person, color]] of PEOPLE.entries()) {
  put({ name: `${person}.png`, kind: 'file', parentId: 'photos', size: 48_000 + index * 3_100, mimeType: 'image/png', modified: ago(48 + index) }, { url: photo(color, person) });
}

const children = (parentId: string | null): FileEntry[] => [...store.values()].map((s) => s.entry).filter((e) => e.parentId === parentId);
const latency = (): number => 180 + Math.round(Math.random() * 220);
function stored(id: string): Stored {
  const s = store.get(id);
  if (!s) throw new Error('The file no longer exists.');
  return s;
}
function withChildren(id: string | null): void {
  if (id === null) return;
  const s = store.get(id);
  if (s) s.entry = { ...s.entry, hasChildren: children(id).some((e) => e.kind === 'folder') };
}

const provider: FileManagerProvider = {
  async list(folderId, { signal }) {
    await wait(latency(), signal);
    return children(folderId);
  },
  async createFolder(parentId, name, { signal }) {
    await wait(latency(), signal);
    const entry = put({ name, kind: 'folder', parentId, hasChildren: false, modified: instant(Date.now()) });
    withChildren(parentId);
    return entry;
  },
  async rename(entry, name, { signal }) {
    await wait(latency(), signal);
    const s = stored(entry.id);
    s.entry = { ...s.entry, name, modified: instant(Date.now()) };
    return s.entry;
  },
  async move(entries, targetFolderId, { signal }) {
    await wait(latency(), signal);
    const sources = new Set(entries.map((e) => e.parentId));
    const moved = entries.map((e) => {
      const s = stored(e.id);
      s.entry = { ...s.entry, parentId: targetFolderId };
      return s.entry;
    });
    for (const id of [...sources, targetFolderId]) withChildren(id);
    return moved;
  },
  async delete(entries, { signal }) {
    await wait(latency(), signal);
    const remove = (id: string): void => {
      for (const child of children(id)) remove(child.id);
      store.delete(id);
    };
    for (const e of entries) remove(e.id);
    for (const e of entries) withChildren(e.parentId);
  },
  async upload(folderId, file, { signal, onProgress }) {
    // Simulated transfer: ten steps; names starting with "fail" are rejected by the "server".
    for (let step = 1; step <= 10; step++) {
      await wait(120, signal);
      onProgress(Math.round((file.size * step) / 10), file.size);
    }
    if (file.name.toLowerCase().startsWith('fail')) throw new Error('The server rejected the file.');
    const text = /\.(?:ts|js|json|md|txt|sql|css|html|sh)$/i.test(file.name) ? await file.text() : undefined;
    return put({ name: file.name, kind: 'file', parentId: folderId, size: file.size, mimeType: file.type, modified: instant(Date.now()) }, text === undefined ? {} : { text });
  },
  async getUrl(entry, { signal }) {
    await wait(120, signal);
    const url = stored(entry.id).url;
    if (url === undefined) throw new Error('This file has no preview.');
    return url;
  },
  async read(entry, { signal }) {
    await wait(120, signal);
    return stored(entry.id).text ?? '';
  },
};

// Activity timeline: seeded history plus live entries from the File Manager.
const activity: TimelineItem[] = [
  { id: 'a1', title: 'Leave policy updated', description: '26 annual days, half days allowed, HR approval added.', tone: 'success', status: 'Published', time: ago(2), avatar: { name: 'Grace Hopper' }, actions: [{ id: 'compare', label: 'Compare versions' }] },
  { id: 'a2', title: 'Handbook edited', description: 'Core hours extended to 16:00.', tone: 'info', time: ago(5), avatar: { name: 'Ada Lovelace' }, actions: [{ id: 'compare', label: 'Compare versions' }] },
  { id: 'a3', title: 'Export script reviewed', tone: 'neutral', time: ago(26), avatar: { name: 'Alan Turing' } },
  { id: 'a4', title: 'Badge photos uploaded', description: 'Four photos for new starters.', tone: 'success', time: ago(48), avatar: { name: 'Katherine Johnson' } },
  { id: 'a5', title: 'Virus scan blocked an upload', description: 'invoice.pdf.exe was quarantined.', tone: 'error', status: 'Blocked', time: ago(52) },
];
let olderPages = 2;
let activityId = 100;

// Layout: files, then the two previews, then activity.
const filesSection = section(sc, 'Files', ['file-manager', 'tour']);
const fm = FileManager.create(hostIn(filesSection), {
  label: 'Company documents',
  root: { id: null, label: 'Documents' },
  provider,
  height: '30rem',
  maxFileSize: 5_000_000,
});
const fmStatus = status(filesSection);
fmStatus.textContent = 'Open a photo or a file (Enter or double click) to preview it.';
sc.listen(fm.host, ['aui-navigate', 'aui-change', 'aui-open', 'aui-create-folder', 'aui-rename', 'aui-move', 'aui-delete', 'aui-upload', 'aui-error'], 'file-manager');

// The tour walks every section, so every section lists it.
const previewSection = section(sc, 'Photos', ['image-viewer', 'tour']);
const images = (): ImageViewerImage[] =>
  children('photos')
    .filter((e) => e.mimeType?.startsWith('image/') === true)
    .map((e) => ({ src: stored(e.id).url ?? '', alt: `Badge photo of ${e.name.replace(/\.png$/, '')}`, caption: e.name, downloadName: e.name }))
    .filter((i) => i.src !== '');
const viewer = ImageViewer.create(hostIn(previewSection), { label: 'Badge photos', images: images(), croppable: true, aspectRatios: [{ label: 'Badge (1:1)', value: 1 }, { label: '4:3', value: 4 / 3 }, { label: 'Free', value: null }] });
sc.listen(viewer.host, ['aui-change', 'aui-zoom', 'aui-rotate', 'aui-crop', 'aui-error'], 'image-viewer');

const LANGUAGES: Readonly<Record<string, CodeLanguage>> = { json: 'json', ts: 'typescript', js: 'javascript', md: 'markdown', sql: 'sql', css: 'css', html: 'html', sh: 'bash' };
const languageOf = (name: string): CodeLanguage => LANGUAGES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'plain';
let diffMode: 'unified' | 'split' = 'unified';
let showDiff = true;
let current = stored('leave-policy');
const codeSection = section(sc, 'File preview', ['code-viewer', 'tour']);
const code = CodeViewer.create(hostIn(codeSection), { label: 'File preview', filename: current.entry.name, language: 'json', diff: { original: policyBefore, modified: policyAfter, mode: diffMode, originalLabel: 'Previous version', modifiedLabel: 'Current version' } });
sc.listen(code.host, ['aui-copy', 'aui-change'], 'code-viewer');

function showCode(s: Stored): void {
  current = s;
  const text = s.text ?? '';
  const language = languageOf(s.entry.name);
  if (showDiff && s.previous !== undefined) code.update({ filename: s.entry.name, language, code: '', diff: { original: s.previous, modified: text, mode: diffMode, originalLabel: 'Previous version', modifiedLabel: 'Current version' } });
  else code.update({ filename: s.entry.name, language, diff: null, code: text });
}

fm.host.addEventListener('aui-open', (event) => {
  const { entry } = (event as CustomEvent<FileManagerOpenDetail>).detail;
  const s = store.get(entry.id);
  if (!s) return;
  // The page shows previews inline instead of the File Manager's dialog, unless the preview
  // section is hidden (the File Manager's focus view on a component page).
  const inline = s.url !== undefined ? !previewSection.hidden : s.text !== undefined && !codeSection.hidden;
  if (!inline) return;
  event.preventDefault();
  if (s.url !== undefined) {
    const list = images();
    viewer.update({ images: list, index: Math.max(0, list.findIndex((i) => i.caption === entry.name)) });
    fmStatus.textContent = `Showing ${entry.name} in the image viewer.`;
    viewer.host.scrollIntoView({ block: 'nearest' });
  } else if (s.text !== undefined) {
    showCode(s);
    fmStatus.textContent = s.previous === undefined ? `Showing ${entry.name}.` : `Showing the changes to ${entry.name}.`;
    code.host.scrollIntoView({ block: 'nearest' });
  }
});

const activitySection = section(sc, 'Activity', ['timeline', 'tour']);
const timeline = Timeline.create(hostIn(activitySection), {
  label: 'Document activity',
  items: activity,
  initialVisible: 4,
  hasMore: true,
  loadMore: async ({ signal }) => {
    await wait(500, signal);
    olderPages--;
    const base = 24 * (6 + (2 - olderPages) * 3);
    return [
      { id: `old-${String(olderPages)}-1`, title: 'Contract template replaced', tone: 'info', time: ago(base), avatar: { name: 'Ada Lovelace' } },
      { id: `old-${String(olderPages)}-2`, title: 'Archive folder cleaned up', tone: 'warning', description: '12 files older than seven years removed.', time: ago(base + 30) },
    ];
  },
});
sc.listen(timeline.host, ['aui-action', 'aui-toggle', 'aui-load-more', 'aui-load-error'], 'timeline');
timeline.host.addEventListener('aui-load-more', () => {
  if (olderPages <= 0) timeline.update({ hasMore: false });
});
timeline.host.addEventListener('aui-action', (event) => {
  const { item } = (event as CustomEvent<TimelineActionDetail>).detail;
  const target = item.id === 'a2' ? [...store.values()].find((s) => s.entry.name === 'Employee handbook.md') : stored('leave-policy');
  if (target) {
    showDiff = true;
    showCode(target);
    code.host.scrollIntoView({ block: 'nearest' });
  }
});

function record(title: string, tone: TimelineTone, description?: string): void {
  activity.unshift({ id: `live-${String(activityId++)}`, title, tone, time: instant(Date.now()), avatar: { name: 'You' }, ...(description === undefined ? {} : { description }) });
  timeline.update({ items: [...activity] });
}
const names = (list: readonly FileEntry[]): string => list.map((e) => e.name).join(', ');
fm.host.addEventListener('aui-create-folder', (e) => {
  record('Folder created', 'success', (e as CustomEvent<FileManagerCreateFolderDetail>).detail.entry.name);
});
fm.host.addEventListener('aui-rename', (e) => {
  const d = (e as CustomEvent<FileManagerRenameDetail>).detail;
  record('Renamed', 'info', `${d.previousName} to ${d.entry.name}`);
});
fm.host.addEventListener('aui-move', (e) => {
  record('Moved', 'info', names((e as CustomEvent<FileManagerMoveDetail>).detail.entries));
});
fm.host.addEventListener('aui-delete', (e) => {
  record('Deleted', 'warning', names((e as CustomEvent<FileManagerDeleteDetail>).detail.entries));
});
fm.host.addEventListener('aui-upload', (e) => {
  record('Uploaded', 'success', (e as CustomEvent<FileManagerUploadDetail>).detail.entry.name);
});
fm.host.addEventListener('aui-error', (e) => {
  const d = (e as CustomEvent<FileManagerErrorDetail>).detail;
  record(`Failed: ${d.operation}`, 'error', d.error instanceof Error ? d.error.message : undefined);
});

// Guided tour of the page.
const tour = Tour.create(hostIn(filesSection), {
  dots: true,
  steps: [
    { id: 'welcome', title: 'Welcome to the document center', content: 'A short tour: files, previews, and activity. Press Escape to leave at any time.' },
    { id: 'toolbar', title: 'File actions', content: 'Create folders, upload, rename, delete, cut and paste, sort, and switch between list and grid.', target: () => fm.host.querySelector('[role="toolbar"]'), placement: 'bottom-start' },
    { id: 'folders', title: 'Folders', content: 'Browse the folder tree; drop files on a folder to move them.', target: () => fm.host.querySelector('.aui-file-manager__folders'), placement: 'right' },
    { id: 'photos', title: 'Photo viewer', content: 'Zoom, rotate, and crop badge photos to a square.', target: () => viewer.host, placement: 'top' },
    { id: 'code', title: 'Compare versions', content: 'See what changed in a file, unified or side by side.', target: () => code.host, placement: 'top' },
    { id: 'activity', title: 'Activity', content: 'Every change you make is added here, grouped by day.', target: () => timeline.host, placement: 'top' },
  ],
});
sc.listen(tour.host, ['aui-start', 'aui-step-change', 'aui-step-missing', 'aui-finish', 'aui-skip'], 'tour');

// Options.
action(sc, 'Start tour', () => {
  void tour.start();
}, ['tour']);
choice(sc, 'View', [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }], 'list', (view) => {
  fm.update({ view });
}, ['file-manager']);
toggle(sc, 'Folder pane', true, (checked) => {
  fm.update({ showFolderPane: checked });
}, ['file-manager']);
toggle(sc, 'Read-only', false, (checked) => {
  fm.update({ readOnly: checked });
}, ['file-manager']);
toggle(sc, 'Show changes', true, (checked) => {
  showDiff = checked;
  showCode(current);
}, ['code-viewer']);
choice(sc, 'Diff layout', [{ value: 'unified', label: 'Unified' }, { value: 'split', label: 'Side by side' }], 'unified', (mode) => {
  diffMode = mode;
  showCode(current);
}, ['code-viewer']);
choice(sc, 'Timeline layout', [{ value: 'start', label: 'Start' }, { value: 'alternate', label: 'Alternate' }], 'start', (layout) => {
  timeline.update({ layout });
}, ['timeline']);
choice(sc, 'Times', [{ value: 'relative', label: 'Relative' }, { value: 'absolute', label: 'Absolute' }], 'relative', (timeFormat) => {
  timeline.update({ timeFormat });
}, ['timeline']);
timeline.update({ timeFormat: 'relative' });
