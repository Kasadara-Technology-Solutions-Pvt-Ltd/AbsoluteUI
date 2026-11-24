/**
 * File Manager (R20 P10). Browses and organizes files held by a host-supplied async
 * provider: a folder tree (Tree View, folders loaded lazily) and the folder content in a
 * Splitter, a path (Breadcrumb), a toolbar, list and grid views, sorting, multiple
 * selection, rename, new folder, delete with confirmation, move by drag and drop or cut and
 * paste, uploads with progress and cancel, and previews (images in an Image Viewer
 * lightbox, text and code in a Code Viewer dialog, or a custom preview).
 *
 * The content view is one APG listbox (`aria-multiselectable`, focus kept on the listbox
 * with `aria-activedescendant`). It is virtualized on `internal/windowing.ts`, the engine of
 * Virtual List: in the list view a window row is one entry; in the grid view a window row
 * holds as many tiles as fit, so 10,000 entries in one folder cost a few dozen elements.
 * The list view's columns are part of each option's text; sorting uses the column buttons
 * above the list or the Sort menu.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatInstant,
  formatNumber,
  getMessage,
  registerMessages,
  runtimeError,
  validators,
  type Density,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { arrowUpIcon } from '@absoluteui/icons/set/arrow-up';
import { arrowUpDownIcon } from '@absoluteui/icons/set/arrow-up-down';
import { clipboardIcon } from '@absoluteui/icons/set/clipboard';
import { cutIcon } from '@absoluteui/icons/set/cut';
import { editIcon } from '@absoluteui/icons/set/edit';
import { fileIcon } from '@absoluteui/icons/set/file';
import { fileCodeIcon } from '@absoluteui/icons/set/file-code';
import { fileImageIcon } from '@absoluteui/icons/set/file-image';
import { fileTextIcon } from '@absoluteui/icons/set/file-text';
import { folderIcon } from '@absoluteui/icons/set/folder';
import { folderOpenIcon } from '@absoluteui/icons/set/folder-open';
import { folderPlusIcon } from '@absoluteui/icons/set/folder-plus';
import { layoutGridIcon } from '@absoluteui/icons/set/layout-grid';
import { layoutListIcon } from '@absoluteui/icons/set/layout-list';
import { refreshIcon } from '@absoluteui/icons/set/refresh';
import { trashIcon } from '@absoluteui/icons/set/trash';
import { uploadIcon } from '@absoluteui/icons/set/upload';
import { announce, createTypeahead, observeResize } from '@absoluteui/utilities';
import { Breadcrumb, type BreadcrumbNavigateDetail } from '../breadcrumb/breadcrumb.js';
import { Button } from '../button/button.js';
import { CodeViewer } from '../code-viewer/code-viewer.js';
import type { CodeLanguage } from '../code-viewer/tokenize.js';
import { ContextMenu, type ContextMenuSelectDetail } from '../context-menu/context-menu.js';
import { Dialog, type DialogCloseDetail } from '../dialog/dialog.js';
import { EmptyState } from '../empty-state/empty-state.js';
import { ImageViewer } from '../image-viewer/image-viewer.js';
import { InlineMessage } from '../inline-message/inline-message.js';
import { fileExtension, formatFileSize, matchesExtension, matchesMimeType } from '../internal/files.js';
import { Windowing } from '../internal/windowing.js';
import type { MenuItem, MenuSelectDetail } from '../menu/engine.js';
import { Menu } from '../menu/menu.js';
import { ProgressBar } from '../progress-bar/progress-bar.js';
import { Spinner } from '../spinner/spinner.js';
import { Splitter } from '../splitter/splitter.js';
import { TextInput } from '../text-input/text-input.js';
import { TreeView, type TreeNode, type TreeViewSelectDetail } from '../tree-view/tree-view.js';
import type {
  FileEntry,
  FileManagerChangeDetail,
  FileManagerCreateFolderDetail,
  FileManagerDeleteDetail,
  FileManagerErrorDetail,
  FileManagerMoveDetail,
  FileManagerNavigateDetail,
  FileManagerOpenDetail,
  FileManagerOperation,
  FileManagerPathItem,
  FileManagerPreview,
  FileManagerProvider,
  FileManagerRenameDetail,
  FileManagerUploadDetail,
} from './types.js';

export type FileManagerView = 'list' | 'grid';
export type FileManagerSortBy = 'name' | 'size' | 'modified' | 'type';
export type FileManagerSortDirection = 'asc' | 'desc';

export interface FileManagerConfig {
  view: FileManagerView;
  sortBy: FileManagerSortBy;
  sortDirection: FileManagerSortDirection;
  /** Folders before files, whatever the sort. */
  foldersFirst: boolean;
  /** Show the folder tree next to the content. */
  showFolderPane: boolean;
}

type Inherited = 'locale' | 'timezone' | 'density';

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    fileManager: FileManagerConfig & { locale: string; timezone: string; density: Density };
  }
}

const VIEWS: readonly FileManagerView[] = ['list', 'grid'];
const SORTS: readonly FileManagerSortBy[] = ['name', 'size', 'modified', 'type'];
const DIRECTIONS: readonly FileManagerSortDirection[] = ['asc', 'desc'];

export const fileManagerConfig = defineComponentConfig<FileManagerConfig, Inherited>(
  'fileManager',
  {
    view: { default: 'list', expected: '"list" | "grid"', validate: validators.oneOf(VIEWS) },
    sortBy: { default: 'name', expected: '"name" | "size" | "modified" | "type"', validate: validators.oneOf(SORTS) },
    sortDirection: { default: 'asc', expected: '"asc" | "desc"', validate: validators.oneOf(DIRECTIONS) },
    foldersFirst: { default: true, expected: 'boolean', validate: validators.isBoolean },
    showFolderPane: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'timezone', 'density'],
);

registerMessages('fileManager', 'en', {
  toolbar: '{label} actions',
  folders: 'Folders',
  contents: 'Contents',
  path: 'Folder path',
  up: 'Up one level',
  newFolder: 'New folder',
  upload: 'Upload',
  rename: 'Rename',
  delete: 'Delete',
  cut: 'Cut',
  paste: 'Paste',
  pasteInto: 'Paste into folder',
  open: 'Open',
  refresh: 'Refresh',
  sort: 'Sort',
  listView: 'List view',
  gridView: 'Grid view',
  sortName: 'Name',
  sortSize: 'Size',
  sortModified: 'Modified',
  sortType: 'Type',
  sortAsc: 'Ascending',
  sortDesc: 'Descending',
  foldersFirst: 'Folders first',
  sortColumn: 'Sort by {column}',
  sortedAsc: '{column}, sorted ascending',
  sortedDesc: '{column}, sorted descending',
  folder: 'Folder',
  fileType: '{ext} file',
  file: 'File',
  loading: 'Loading folder',
  empty: 'This folder is empty',
  emptyHint: 'Upload files or create a folder.',
  loadFailed: 'Could not load this folder',
  loadFailedHint: 'Check your connection and try again.',
  retry: 'Try again',
  count: '{count} items',
  countOne: '1 item',
  countSelected: '{count} items, {selected} selected',
  countOneSelected: '1 item, 1 selected',
  opened: '{name}, {count} items',
  nameLabel: 'Name',
  newFolderTitle: 'New folder',
  newFolderName: 'New folder',
  renameTitle: 'Rename {name}',
  create: 'Create',
  save: 'Rename',
  cancel: 'Cancel',
  dismiss: 'Dismiss',
  nameEmpty: 'Enter a name.',
  nameInvalid: 'A name cannot contain / or \\ or be . or ..',
  nameTooLong: 'Use at most {max} characters.',
  nameTaken: 'An item named {name} already exists in this folder.',
  deleteTitle: 'Delete {name}?',
  deleteTitleMany: 'Delete {count} items?',
  deleteText: 'This cannot be undone.',
  created: 'Folder {name} created',
  renamed: 'Renamed to {name}',
  deleted: '{count} items deleted',
  deletedOne: '{name} deleted',
  moved: 'Moved {count} items to {folder}',
  movedOne: 'Moved {name} to {folder}',
  cutDone: '{count} items cut. Open a folder and press Control+V to paste.',
  uploading: 'Uploading {name}',
  uploaded: '{name} uploaded',
  uploadFailed: 'Could not upload {name}',
  uploadCancelled: 'Upload of {name} cancelled',
  uploadRejectedType: '{name} is not an accepted file type.',
  uploadRejectedSize: '{name} is larger than {max}.',
  cancelUpload: 'Cancel upload of {name}',
  dismissUpload: 'Dismiss {name}',
  uploads: 'Uploads',
  errorCreate: 'Could not create the folder.',
  errorRename: 'Could not rename the item.',
  errorMove: 'Could not move the items.',
  errorMoveInto: 'A folder cannot be moved into itself.',
  errorDelete: 'Could not delete the items.',
  errorPreview: 'Could not open a preview of {name}.',
  dropHere: 'Drop to upload to {folder}',
});

export interface FileManagerIcons {
  folder: IconRef;
  folderOpen: IconRef;
  file: IconRef;
  image: IconRef;
  code: IconRef;
  text: IconRef;
  up: IconRef;
  newFolder: IconRef;
  upload: IconRef;
  rename: IconRef;
  delete: IconRef;
  cut: IconRef;
  paste: IconRef;
  sort: IconRef;
  list: IconRef;
  grid: IconRef;
  refresh: IconRef;
}

const DEFAULT_ICONS: FileManagerIcons = {
  folder: folderIcon,
  folderOpen: folderOpenIcon,
  file: fileIcon,
  image: fileImageIcon,
  code: fileCodeIcon,
  text: fileTextIcon,
  up: arrowUpIcon,
  newFolder: folderPlusIcon,
  upload: uploadIcon,
  rename: editIcon,
  delete: trashIcon,
  cut: cutIcon,
  paste: clipboardIcon,
  sort: arrowUpDownIcon,
  list: layoutListIcon,
  grid: layoutGridIcon,
  refresh: refreshIcon,
};

export interface FileManagerRoot {
  /** Id passed to `provider.list` for the top folder (null by default). */
  id: string | null;
  /** Name of the top folder in the path and the folder tree, such as "Documents". */
  label: string;
}

export interface FileManagerOptions extends Partial<FileManagerConfig> {
  /** Accessible name of the File Manager region, such as "Company documents". */
  label: string;
  provider: FileManagerProvider;
  /** The top folder. Default `{ id: null, label }`. */
  root?: FileManagerRoot;
  /** No create, rename, move, delete, or upload. */
  readOnly?: boolean;
  /** Accepted uploads: MIME types (`image/*`, `application/pdf`) and extensions (`.csv`). Default: any. */
  accept?: readonly string[];
  /** Largest accepted upload in bytes. */
  maxFileSize?: number;
  /** Preview when a file is opened: `'auto'` (images and text, default), `false`, or a function. */
  preview?: 'auto' | false | FileManagerPreview;
  /** Block size as a CSS length, or null to fill the host (the host needs a height). Default `'32rem'`. */
  height?: string | null;
  locale?: string;
  timezone?: string;
  density?: Density;
  icons?: Partial<FileManagerIcons>;
}

type Resolved = Readonly<FileManagerConfig & { locale: string; timezone: string; density: Density }>;
type Command = 'up' | 'new-folder' | 'upload' | 'rename' | 'delete' | 'cut' | 'paste' | 'paste-into' | 'open' | 'refresh';

interface UploadRow {
  readonly el: HTMLLIElement;
  readonly bar: ProgressBar;
  readonly button: Button;
  readonly abort: AbortController;
  done: boolean;
}

const DRAG_TYPE = 'application/x-absoluteui-file-manager';
const ROOT_TREE_ID = 'r';
const MAX_NAME = 255;
const MAX_ENTRIES = 100_000;
const CSS_LENGTH = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em|vh|svh|dvh|lvh|%|cqh))$/;
const ROW_BY_DENSITY: Readonly<Record<Density, number>> = { compact: 32, comfortable: 40, spacious: 48 };
const TILE_BY_DENSITY: Readonly<Record<Density, { w: number; h: number }>> = { compact: { w: 104, h: 96 }, comfortable: { w: 120, h: 112 }, spacious: { w: 136, h: 128 } };
const TILE_GAP = 8;
const ARROW_UP = String.fromCharCode(0x2191);
const ARROW_DOWN = String.fromCharCode(0x2193);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp']);
const CODE_EXT: Readonly<Record<string, CodeLanguage>> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.json': 'json', '.html': 'html', '.htm': 'html', '.css': 'css', '.sql': 'sql', '.sh': 'bash', '.bash': 'bash', '.md': 'markdown',
  '.txt': 'plain', '.csv': 'plain', '.log': 'plain', '.xml': 'html', '.yml': 'plain', '.yaml': 'plain',
};

function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32 || text.charCodeAt(i) === 127) return true;
  return false;
}

const folderKey = (id: string | null): string => (id === null ? 'root' : `f:${id}`);
const COMMANDS: ReadonlySet<string> = new Set(['up', 'new-folder', 'upload', 'rename', 'delete', 'cut', 'paste', 'paste-into', 'open', 'refresh']);
const isCommand = (id: string | undefined): id is Command => id !== undefined && COMMANDS.has(id);
const isAbort = (signal: AbortSignal): boolean => signal.aborted;

function isInstant(v: unknown): boolean {
  return validators.isRecord(v) && v.kind === 'Instant' && typeof v.epochMilliseconds === 'number' && Number.isFinite(v.epochMilliseconds);
}

/** Checks one provider entry (the provider is application code, but its data may come from a server). */
function isEntry(v: unknown): v is FileEntry {
  if (!validators.isRecord(v)) return false;
  const { id, name, kind, size, modified, mimeType, parentId, hasChildren, readOnly } = v;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name.trim() === '') return false;
  if (kind !== 'folder' && kind !== 'file') return false;
  if (parentId !== null && typeof parentId !== 'string') return false;
  if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size < 0)) return false;
  if (modified !== undefined && !isInstant(modified)) return false;
  if (mimeType !== undefined && typeof mimeType !== 'string') return false;
  if (hasChildren !== undefined && typeof hasChildren !== 'boolean') return false;
  return readOnly === undefined || typeof readOnly === 'boolean';
}

function providerError(): Error {
  return runtimeError('FILE_MANAGER_PROVIDER', 'The file manager provider returned invalid entries.', { component: 'file-manager', property: 'fileManager.provider' });
}

function checkEntries(list: unknown): FileEntry[] {
  if (!Array.isArray(list) || list.length > MAX_ENTRIES) throw providerError();
  const out: FileEntry[] = [];
  const ids = new Set<string>();
  for (const e of list) {
    if (!isEntry(e) || ids.has(e.id)) throw providerError();
    ids.add(e.id);
    out.push(e);
  }
  return out;
}

function checkEntry(e: unknown): FileEntry {
  if (!isEntry(e)) throw providerError();
  return e;
}

export class FileManager {
  readonly host: HTMLElement;
  #options: FileManagerOptions;
  #resolved: Resolved;
  readonly #doc: Document;
  readonly #id = createId('aui-file-manager');
  readonly #group = new DisposableGroup();
  readonly #typeahead = createTypeahead();

  // Structure.
  readonly #toolbar: HTMLDivElement;
  readonly #pathHost: HTMLDivElement;
  readonly #message: HTMLDivElement;
  readonly #body: HTMLDivElement;
  readonly #treeHost: HTMLDivElement;
  readonly #content: HTMLDivElement;
  readonly #columns: HTMLDivElement;
  readonly #viewport: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #state: HTMLDivElement;
  readonly #uploadList: HTMLUListElement;
  readonly #status: HTMLDivElement;
  readonly #lightbox: HTMLDivElement;
  readonly #picker: HTMLInputElement;

  // Composed components.
  #buttons = new Map<string, Button>();
  #columnButtons = new Map<FileManagerSortBy, Button>();
  #sortMenu: Menu | null = null;
  #breadcrumb: Breadcrumb | null = null;
  #tree: TreeView | null = null;
  #splitter: Splitter | null = null;
  #contextMenu: ContextMenu | null = null;
  #stateView: { destroy(): void } | null = null;
  #messageView: { inline: InlineMessage; dismiss: Button } | null = null;
  #dialogs = new Set<Dialog>();
  #viewers = new Set<ImageViewer | CodeViewer>();
  readonly #uploads = new Set<UploadRow>();

  // Data.
  #folder: string | null;
  #path: FileManagerPathItem[];
  #entries: FileEntry[] = [];
  #phase: 'loading' | 'ready' | 'error' = 'loading';
  readonly #known = new Map<string, FileEntry>();
  readonly #children = new Map<string, FileEntry[]>();
  #listAbort: AbortController | null = null;
  readonly #ops = new Set<AbortController>();

  // View state.
  readonly #selected = new Set<string>();
  #active = -1;
  #anchor = -1;
  #cut: Set<string> | null = null;
  #dragIds: string[] | null = null;
  readonly #win = new Windowing(0, ROW_BY_DENSITY.comfortable);
  readonly #rows = new Map<number, HTMLDivElement>();
  #cols = 1;
  #frame = 0;
  #labels: string[] | null = null;
  #rootOpened = false;

  /** Render into `host` (the host's children are replaced) and list the root folder. */
  static create(host: HTMLElement, options: FileManagerOptions): FileManager {
    return new FileManager(host, options);
  }

  private constructor(host: HTMLElement, options: FileManagerOptions) {
    FileManager.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#resolved = this.#resolve();
    const root = this.#root();
    this.#folder = root.id;
    this.#path = [{ id: root.id, label: root.label }];
    const doc = this.#doc;
    const div = (cls: string): HTMLDivElement => {
      const el = doc.createElement('div');
      el.className = `aui-file-manager__${cls}`;
      return el;
    };
    this.#toolbar = div('toolbar');
    this.#toolbar.setAttribute('role', 'toolbar');
    this.#pathHost = div('path');
    this.#message = div('message');
    this.#message.hidden = true;
    this.#body = div('body');
    this.#treeHost = div('folders');
    this.#content = div('content');
    this.#content.setAttribute('role', 'group');
    this.#content.tabIndex = -1;
    this.#columns = div('columns');
    this.#viewport = div('viewport');
    this.#viewport.id = `${this.#id}-list`;
    this.#viewport.tabIndex = 0;
    this.#viewport.setAttribute('role', 'listbox');
    this.#viewport.setAttribute('aria-multiselectable', 'true');
    this.#canvas = div('canvas');
    this.#canvas.setAttribute('role', 'none');
    this.#viewport.append(this.#canvas);
    this.#state = div('state');
    this.#uploadList = doc.createElement('ul');
    this.#uploadList.className = 'aui-file-manager__uploads';
    this.#uploadList.hidden = true;
    this.#status = div('status');
    this.#status.setAttribute('role', 'status');
    this.#lightbox = div('lightbox');
    this.#picker = doc.createElement('input');
    this.#picker.type = 'file';
    this.#picker.multiple = true;
    this.#picker.hidden = true;
    this.#picker.tabIndex = -1;
    this.#content.append(this.#columns, this.#viewport, this.#state, this.#uploadList);

    // Everything that can throw (config, icons, composed components) runs before the host changes.
    this.#buildToolbar();
    this.#buildColumns();
    this.#breadcrumb = Breadcrumb.create(this.#pathHost, { items: this.#crumbs(), label: this.#m('path') });
    this.#renderChrome();

    host.classList.add('aui-file-manager');
    host.setAttribute('role', 'region');
    host.replaceChildren(this.#toolbar, this.#pathHost, this.#message, this.#body, this.#status, this.#picker, this.#lightbox);
    this.#buildPanes();
    this.#bind();
    this.#group.add(fileManagerConfig.subscribe(() => {
      this.#resolved = this.#resolve();
      this.#rerender();
    }));
    void this.#load(this.#folder, null);
  }

  // Public state.

  get options(): Readonly<FileManagerOptions> {
    return this.#options;
  }

  /** The folder shown. */
  get currentFolderId(): string | null {
    return this.#folder;
  }

  /** The path from the root to the current folder. */
  get path(): FileManagerPathItem[] {
    return this.#path.map((p) => ({ ...p }));
  }

  /** Ids of the selected entries. */
  get selected(): string[] {
    return [...this.#selected];
  }

  /** The entries of the current folder in display order. */
  get entries(): readonly FileEntry[] {
    return this.#entries;
  }

  get view(): FileManagerView {
    return this.#resolved.view;
  }

  /** A folder listing is in progress. */
  get loading(): boolean {
    return this.#phase === 'loading';
  }

  /** Show a folder (aborts a pending listing). Folders seen before get their full path. */
  navigate(folderId: string | null): Promise<void> {
    return this.#load(folderId, null);
  }

  /** List the current folder again. */
  refresh(): Promise<void> {
    return this.#load(this.#folder, null, true);
  }

  /** Select entries of the current folder by id (no event). */
  select(ids: readonly string[]): void {
    this.#selected.clear();
    for (const id of ids) if (this.#entries.some((e) => e.id === id)) this.#selected.add(id);
    const first = this.#entries.findIndex((e) => this.#selected.has(e.id));
    if (first >= 0) this.#active = first;
    this.#sync();
  }

  /** Upload files to the current folder (validated against `accept` and `maxFileSize`). */
  upload(files: readonly File[]): void {
    this.#startUploads(files, this.#folder);
  }

  update(options: Partial<FileManagerOptions>): void {
    const next = { ...this.#options, ...options };
    FileManager.#assert(next);
    const previous = { options: this.#options, resolved: this.#resolved };
    this.#options = next;
    try {
      this.#resolved = this.#resolve();
    } catch (error) {
      this.#options = previous.options;
      this.#resolved = previous.resolved;
      throw error;
    }
    const reset = (options.provider !== undefined && options.provider !== previous.options.provider) || (options.root !== undefined && JSON.stringify(options.root) !== JSON.stringify(previous.options.root));
    if (options.showFolderPane !== undefined && options.showFolderPane !== previous.resolved.showFolderPane) this.#buildPanes();
    if (reset) {
      this.#children.clear();
      this.#known.clear();
      this.#cut = null;
      this.#rootOpened = false;
      const root = this.#root();
      this.#path = [{ id: root.id, label: root.label }];
      void this.#load(root.id, null);
    }
    this.#rerender();
  }

  destroy(): void {
    this.#group.dispose();
    this.#listAbort?.abort();
    for (const c of this.#ops) c.abort();
    this.#ops.clear();
    if (this.#frame) this.#doc.defaultView?.cancelAnimationFrame(this.#frame);
    this.#typeahead.reset();
    for (const u of this.#uploads) {
      u.abort.abort();
      u.bar.destroy();
      u.button.destroy();
    }
    this.#uploads.clear();
    for (const b of this.#buttons.values()) b.destroy();
    for (const b of this.#columnButtons.values()) b.destroy();
    this.#sortMenu?.destroy();
    this.#breadcrumb?.destroy();
    this.#contextMenu?.destroy();
    this.#tree?.destroy();
    this.#splitter?.destroy();
    this.#stateView?.destroy();
    this.#messageView?.inline.destroy();
    this.#messageView?.dismiss.destroy();
    for (const d of this.#dialogs) d.destroy();
    for (const v of this.#viewers) v.destroy();
    this.#dialogs.clear();
    this.#viewers.clear();
    this.host.replaceChildren();
    this.host.removeAttribute('role');
    this.host.removeAttribute('aria-label');
    this.host.classList.remove('aui-file-manager', 'aui-file-manager--grid', 'aui-file-manager--list', 'aui-file-manager--fill', 'aui-file-manager--no-pane', 'aui-file-manager--readonly');
    for (const p of ['--_aui-file-manager-height', '--_aui-file-manager-row', '--_aui-file-manager-tile-w', '--_aui-file-manager-tile-h']) this.host.style.removeProperty(p);
  }

  // Options and configuration.

  static #assert(o: FileManagerOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('FILE_MANAGER_OPTIONS', 'Invalid file manager options.', { component: 'file-manager', property: `fileManager.${property}`, expected });
    };
    const label: unknown = o.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const provider: unknown = o.provider;
    if (!validators.isRecord(provider)) fail('provider', 'FileManagerProvider');
    else {
      for (const name of ['list', 'createFolder', 'rename', 'move', 'delete', 'upload'] as const) if (typeof provider[name] !== 'function') fail(`provider.${name}`, 'function');
      for (const name of ['getUrl', 'read'] as const) if (provider[name] !== undefined && typeof provider[name] !== 'function') fail(`provider.${name}`, 'function or undefined');
    }
    const root: unknown = o.root;
    if (root !== undefined && !(validators.isRecord(root) && (root.id === null || (typeof root.id === 'string' && root.id !== '')) && typeof root.label === 'string' && root.label.trim() !== '')) fail('root', '{ id: string | null; label: string }');
    const readOnly: unknown = o.readOnly;
    if (readOnly !== undefined && typeof readOnly !== 'boolean') fail('readOnly', 'boolean');
    const accept: unknown = o.accept;
    if (accept !== undefined && !(Array.isArray(accept) && accept.every((a) => typeof a === 'string' && a.trim() !== ''))) fail('accept', 'array of MIME types and extensions');
    const max: unknown = o.maxFileSize;
    if (max !== undefined && !(typeof max === 'number' && Number.isFinite(max) && max > 0)) fail('maxFileSize', 'positive number of bytes');
    const preview: unknown = o.preview;
    if (preview !== undefined && preview !== 'auto' && preview !== false && typeof preview !== 'function') fail('preview', "'auto' | false | function");
    const height: unknown = o.height;
    if (height !== undefined && height !== null && (typeof height !== 'string' || !CSS_LENGTH.test(height.trim()))) fail('height', "CSS length such as '32rem', or null");
  }

  #resolve(): Resolved {
    const o = this.#options;
    return fileManagerConfig.resolve({
      ...(o.view === undefined ? {} : { view: o.view }),
      ...(o.sortBy === undefined ? {} : { sortBy: o.sortBy }),
      ...(o.sortDirection === undefined ? {} : { sortDirection: o.sortDirection }),
      ...(o.foldersFirst === undefined ? {} : { foldersFirst: o.foldersFirst }),
      ...(o.showFolderPane === undefined ? {} : { showFolderPane: o.showFolderPane }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.density === undefined ? {} : { density: o.density }),
    });
  }

  #root(): FileManagerRoot {
    return this.#options.root ?? { id: null, label: this.#options.label };
  }

  #icons(): FileManagerIcons {
    return { ...DEFAULT_ICONS, ...this.#options.icons };
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('fileManager', id, params, this.#resolved.locale);
  }

  #n(value: number): string {
    return formatNumber(value, {}, this.#resolved.locale);
  }

  #readOnly(): boolean {
    return this.#options.readOnly === true;
  }

  // Building.

  #buildToolbar(): void {
    const icons = this.#icons();
    const add = (id: string, text: string | null, label: string, icon: IconRef, extra: { pressed?: boolean } = {}): Button => {
      const b = Button.create({ ...(text === null ? { label } : { text }), icon, variant: 'ghost', size: 'sm', ...extra }, this.#doc);
      b.element.dataset.command = id;
      if (text === null) b.element.title = label;
      b.element.classList.add('aui-file-manager__tool');
      this.#buttons.set(id, b);
      return b;
    };
    const group = (...buttons: Button[]): HTMLDivElement => {
      const g = this.#doc.createElement('div');
      g.className = 'aui-file-manager__tools';
      g.setAttribute('role', 'none');
      g.append(...buttons.map((b) => b.element));
      return g;
    };
    const up = add('up', null, this.#m('up'), icons.up);
    const newFolder = add('new-folder', this.#m('newFolder'), this.#m('newFolder'), icons.newFolder);
    const upload = add('upload', this.#m('upload'), this.#m('upload'), icons.upload);
    const rename = add('rename', null, this.#m('rename'), icons.rename);
    const del = add('delete', null, this.#m('delete'), icons.delete);
    const cut = add('cut', null, this.#m('cut'), icons.cut);
    const paste = add('paste', null, this.#m('paste'), icons.paste);
    const sort = add('sort', this.#m('sort'), this.#m('sort'), icons.sort);
    const list = add('view-list', null, this.#m('listView'), icons.list, { pressed: this.#resolved.view === 'list' });
    const grid = add('view-grid', null, this.#m('gridView'), icons.grid, { pressed: this.#resolved.view === 'grid' });
    const refresh = add('refresh', null, this.#m('refresh'), icons.refresh);
    this.#toolbar.append(group(up), group(newFolder, upload), group(rename, del, cut, paste), group(sort, list, grid, refresh));
    // Menu requires its trigger to be attached.
    this.#sortMenu = Menu.create(sort.element, { items: this.#sortItems(), label: this.#m('sort') });
  }

  #sortItems(): MenuItem[] {
    const r = this.#resolved;
    const by = (id: FileManagerSortBy, label: string): MenuItem => ({ type: 'radio', id: `sort-${id}`, label, group: 'aui-fm-sort-by', checked: r.sortBy === id });
    return [
      by('name', this.#m('sortName')),
      by('size', this.#m('sortSize')),
      by('modified', this.#m('sortModified')),
      by('type', this.#m('sortType')),
      { type: 'separator' },
      { type: 'radio', id: 'dir-asc', label: this.#m('sortAsc'), group: 'aui-fm-sort-dir', checked: r.sortDirection === 'asc' },
      { type: 'radio', id: 'dir-desc', label: this.#m('sortDesc'), group: 'aui-fm-sort-dir', checked: r.sortDirection === 'desc' },
      { type: 'separator' },
      { type: 'checkbox', id: 'folders-first', label: this.#m('foldersFirst'), checked: r.foldersFirst },
    ];
  }

  #buildColumns(): void {
    this.#columns.setAttribute('role', 'none');
    const columns: [FileManagerSortBy, string][] = [['name', 'sortName'], ['size', 'sortSize'], ['modified', 'sortModified'], ['type', 'sortType']];
    for (const [id, message] of columns) {
      const b = Button.create({ text: this.#m(message), variant: 'ghost', size: 'sm' }, this.#doc);
      b.element.classList.add('aui-file-manager__column', `aui-file-manager__column--${id}`);
      b.element.dataset.sort = id;
      const arrow = this.#doc.createElement('span');
      arrow.className = 'aui-file-manager__sort-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      b.element.append(arrow);
      this.#columnButtons.set(id, b);
      this.#columns.append(b.element);
    }
  }

  /** The folder tree and the Splitter (or the content alone without the folder pane). */
  #buildPanes(): void {
    this.#tree?.destroy();
    this.#tree = null;
    this.#splitter?.destroy();
    this.#splitter = null;
    if (!this.#resolved.showFolderPane) {
      this.#body.replaceChildren(this.#content);
      return;
    }
    this.#tree = TreeView.create(this.#treeHost, {
      label: this.#m('folders'),
      nodes: this.#treeNodes(),
      selection: 'single',
      selected: [this.#treeId(this.#folder)],
      expanded: this.#children.has(folderKey(this.#root().id)) ? [ROOT_TREE_ID] : [],
      height: null,
      loadChildren: async (node, context) => {
        const folderId = this.#fromTree(node.id);
        const list = checkEntries(await this.#options.provider.list(folderId, { signal: context.signal }));
        this.#store(folderId, list);
        return this.#folderNodes(folderId, new Set([node.id]));
      },
      ...(this.#options.density === undefined ? {} : { density: this.#options.density }),
      ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }),
    });
    this.#splitter = Splitter.create(this.#body, {
      panes: [
        { content: this.#treeHost, label: this.#m('folders'), size: '28%', min: 160, max: '60%', collapsible: true },
        { content: this.#content, label: this.#m('contents') },
      ],
      ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }),
    });
  }

  #treeId(folderId: string | null): string {
    return folderId === this.#root().id ? ROOT_TREE_ID : `f:${folderId ?? ''}`;
  }

  #fromTree(id: string): string | null {
    return id === ROOT_TREE_ID ? this.#root().id : id.slice(2);
  }

  #folderNodes(folderId: string | null, seen: Set<string>): TreeNode[] {
    const icons = this.#icons();
    const collator = new Intl.Collator(this.#resolved.locale, { numeric: true, sensitivity: 'base' });
    const folders = (this.#children.get(folderKey(folderId)) ?? []).filter((e) => e.kind === 'folder').sort((a, b) => collator.compare(a.name, b.name));
    return folders.map((f) => this.#treeNode(f.id, f.name, f.hasChildren, seen, icons));
  }

  #treeNode(folderId: string | null, label: string, hasChildren: boolean | undefined, seen: Set<string>, icons: FileManagerIcons): TreeNode {
    const id = this.#treeId(folderId);
    const base = { id, label, icon: icons.folder, expandedIcon: icons.folderOpen };
    // A provider that reports a folder inside itself must not loop.
    if (seen.has(id) && id !== ROOT_TREE_ID) return { ...base, hasChildren: false };
    const loaded = this.#children.has(folderKey(folderId));
    if (!loaded) return hasChildren === false ? base : { ...base, hasChildren: true };
    const next = new Set(seen).add(id);
    return { ...base, children: this.#folderNodes(folderId, next) };
  }

  #treeNodes(): TreeNode[] {
    const root = this.#root();
    return [this.#treeNode(root.id, root.label, true, new Set([ROOT_TREE_ID]), this.#icons())];
  }

  #syncTree(): void {
    const tree = this.#tree;
    if (!tree) return;
    const expanded = new Set(tree.expanded);
    // Ancestors of the current folder are expanded so the current folder is visible.
    for (const p of this.#path.slice(0, -1)) expanded.add(this.#treeId(p.id));
    // The root opens once, when its folders are first known; afterwards the user decides.
    if (!this.#rootOpened && this.#children.has(folderKey(this.#root().id))) {
      expanded.add(ROOT_TREE_ID);
      this.#rootOpened = true;
    }
    tree.update({ nodes: this.#treeNodes(), expanded: [...expanded], selected: [this.#treeId(this.#folder)] });
  }

  #crumbs(): { label: string; href: string }[] {
    // Fragment hrefs make every ancestor a link; `aui-navigate` is canceled and handled here.
    return this.#path.map((p) => ({ label: p.label, href: '#' }));
  }

  // Events.

  #bind(): void {
    const g = this.#group;
    const vp = this.#viewport;
    g.listen(this.#toolbar, 'click', (event) => {
      // The dispatch path, not `target.closest`: a toggle Button re-renders its icon on click, so a
      // click on the icon has a detached target by the time it bubbles here.
      const el = event.composedPath().find((n): n is HTMLButtonElement => n instanceof HTMLButtonElement && n.dataset.command !== undefined && this.#toolbar.contains(n));
      const id = el?.dataset.command;
      if (id === undefined || id === 'sort') return;
      if (id === 'view-list' || id === 'view-grid') {
        this.#setView(id === 'view-list' ? 'list' : 'grid');
        return;
      }
      if (isCommand(id)) this.#run(id);
    });
    g.listen(this.#toolbar, 'keydown', (event) => {
      this.#onToolbarKey(event);
    });
    if (this.#sortMenu) {
      this.#on(this.#sortMenu.trigger, 'aui-select', (event) => {
        this.#onSort((event as CustomEvent<MenuSelectDetail>).detail);
      });
    }
    g.listen(this.#columns, 'click', (event) => {
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-sort]') : null;
      const by = SORTS.find((s) => s === el?.dataset.sort);
      if (!by) return;
      const r = this.#resolved;
      this.#setSort(by, r.sortBy === by && r.sortDirection === 'asc' ? 'desc' : 'asc', r.foldersFirst);
    });
    this.#on(this.#pathHost, 'aui-navigate', (event) => {
      event.preventDefault();
      const target = this.#path[(event as CustomEvent<BreadcrumbNavigateDetail>).detail.index];
      if (target) void this.#load(target.id, null);
    });
    this.#on(this.#treeHost, 'aui-select', (event) => {
      const id = (event as CustomEvent<TreeViewSelectDetail>).detail.selected[0];
      if (id === undefined) return;
      const folderId = this.#fromTree(id);
      if (folderId !== this.#folder) void this.#load(folderId, null);
    });
    g.listen(vp, 'keydown', (event) => {
      this.#onKey(event);
    });
    g.listen(vp, 'click', (event) => {
      this.#onClick(event);
    });
    g.listen(vp, 'dblclick', (event) => {
      const index = this.#indexOf(event.target);
      const entry = this.#entries[index];
      if (entry) this.#open(entry);
    });
    g.listen(vp, 'scroll', () => {
      this.#schedule();
    }, { passive: true });
    g.add(observeResize(vp, () => {
      this.#schedule(true);
    }));
    // Selection follows the pointer before the context menu opens.
    g.listen(vp, 'contextmenu', (event) => {
      this.#ensureContextMenu();
      const index = this.#indexOf(event.target);
      const entry = this.#entries[index];
      if (entry && !this.#selected.has(entry.id)) this.#setSelection([entry.id], index, true);
      else if (!entry) this.#setSelection([], this.#active, true);
      this.#syncCommands();
    });
    g.listen(this.host, 'focusin', () => {
      this.#ensureContextMenu();
    });
    // Drag and drop: internal moves and OS file uploads.
    g.listen(vp, 'dragstart', (event) => {
      this.#onDragStart(event);
    });
    g.listen(vp, 'dragend', () => {
      this.#dragIds = null;
      this.#clearDrop();
    });
    for (const zone of [this.#content, this.#treeHost]) {
      g.listen(zone, 'dragover', (event) => {
        this.#onDragOver(event);
      });
      g.listen(zone, 'dragleave', (event) => {
        if (!(event.relatedTarget instanceof Node) || !zone.contains(event.relatedTarget)) this.#clearDrop();
      });
      g.listen(zone, 'drop', (event) => {
        this.#onDrop(event);
      });
    }
    g.listen(this.#picker, 'change', () => {
      const files = [...(this.#picker.files ?? [])];
      this.#picker.value = '';
      this.#startUploads(files, this.#folder);
    });
    // Events of the composed components stay inside: the File Manager reports its own.
    const inner = ['aui-change', 'aui-select', 'aui-expand', 'aui-navigate', 'aui-action', 'aui-move', 'aui-rename', 'aui-activate', 'aui-range-change', 'aui-open', 'aui-close', 'aui-zoom', 'aui-error', 'aui-copy'];
    for (const zone of [this.#toolbar, this.#pathHost, this.#message, this.#body, this.#lightbox]) {
      for (const type of inner) this.#on(zone, type, (event) => {
        event.stopPropagation();
      });
    }
  }

  /** Listen to a custom event until destroy. */
  #on(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.#group.add(() => {
      target.removeEventListener(type, handler);
    });
  }

  #ensureContextMenu(): void {
    if (this.#contextMenu || !this.#viewport.isConnected) return;
    this.#contextMenu = ContextMenu.create(this.#viewport, { items: this.#contextItems(), label: this.#options.label });
    this.#on(this.#viewport, 'aui-select', (event) => {
      const id = (event as CustomEvent<ContextMenuSelectDetail>).detail.id;
      if (isCommand(id)) this.#run(id);
    });
  }

  #onToolbarKey(event: KeyboardEvent): void {
    const buttons = [...this.#toolbar.querySelectorAll<HTMLButtonElement>('button[data-command]')].filter((b) => !b.disabled);
    const current = buttons.findIndex((b) => b === event.target);
    if (current < 0) return;
    const rtl = getComputedStyle(this.host).direction === 'rtl';
    let next: number;
    if (event.key === 'ArrowRight') next = current + (rtl ? -1 : 1);
    else if (event.key === 'ArrowLeft') next = current + (rtl ? 1 : -1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    next = (next + buttons.length) % buttons.length;
    for (const b of buttons) b.tabIndex = -1;
    const target = buttons[next];
    if (target) {
      target.tabIndex = 0;
      target.focus();
    }
  }

  // Loading.

  async #load(folderId: string | null, focusId: string | null, keepSelection = false): Promise<void> {
    this.#listAbort?.abort();
    const controller = new AbortController();
    this.#listAbort = controller;
    const previous = this.#folder;
    this.#folder = folderId;
    this.#path = this.#pathTo(folderId);
    if (previous !== folderId || !keepSelection) {
      this.#selected.clear();
      this.#active = -1;
      this.#anchor = -1;
    }
    const hadFocus = this.host.contains(this.#doc.activeElement) && (this.#doc.activeElement === this.#viewport || this.#doc.activeElement === this.#content);
    this.#phase = 'loading';
    this.#hideMessage();
    this.#renderChrome();
    this.#renderState();
    if (previous !== folderId) emit(this.host, 'aui-navigate', { folderId, path: this.path } satisfies FileManagerNavigateDetail);
    try {
      const list = checkEntries(await this.#options.provider.list(folderId, { signal: controller.signal }));
      if (isAbort(controller.signal) || this.#group.disposed) return;
      this.#store(folderId, list);
      this.#phase = 'ready';
    } catch (error) {
      if (isAbort(controller.signal) || this.#group.disposed) return;
      this.#phase = 'error';
      this.#entries = [];
      this.#fail('list', error, []);
    } finally {
      if (this.#listAbort === controller) this.#listAbort = null;
    }
    this.#applyEntries();
    if (focusId !== null) {
      const index = this.#entries.findIndex((e) => e.id === focusId);
      if (index >= 0) this.#setSelection([focusId], index, false);
    } else if (!keepSelection && this.#entries.length > 0) this.#active = 0;
    this.#selectedPrune();
    this.#path = this.#pathTo(folderId);
    this.#renderChrome();
    this.#syncTree();
    this.#renderState();
    this.#relayout();
    if (this.#phase === 'ready' && previous !== folderId) announce(this.#m('opened', { name: this.#path[this.#path.length - 1]?.label ?? '', count: this.#n(this.#entries.length) }), 'polite', this.#doc);
    if (hadFocus) this.#restoreFocus();
  }

  /** Focus the list after it changed, or a sensible fallback when the folder is empty. */
  #restoreFocus(): void {
    if (this.#entries.length > 0 && !this.#viewport.hidden) {
      this.#viewport.focus({ preventScroll: true });
      return;
    }
    const action = this.#state.querySelector<HTMLElement>('button');
    (action ?? this.#content).focus({ preventScroll: true });
  }

  #store(folderId: string | null, list: readonly FileEntry[]): void {
    this.#children.set(folderKey(folderId), [...list]);
    for (const e of list) this.#known.set(e.id, e);
  }

  #pathTo(folderId: string | null): FileManagerPathItem[] {
    const root = this.#root();
    const chain: FileManagerPathItem[] = [];
    let id = folderId;
    const seen = new Set<string>();
    while (id !== root.id && id !== null && !seen.has(id)) {
      seen.add(id);
      const entry = this.#known.get(id);
      if (!entry) break;
      chain.unshift({ id: entry.id, label: entry.name });
      id = entry.parentId;
    }
    return [{ id: root.id, label: root.label }, ...chain];
  }

  #isDescendantOrSelf(folderId: string | null, ancestorId: string): boolean {
    let id = folderId;
    const seen = new Set<string>();
    while (id !== null && !seen.has(id)) {
      if (id === ancestorId) return true;
      seen.add(id);
      id = this.#known.get(id)?.parentId ?? null;
    }
    return false;
  }

  /** Sort the cached entries of the current folder into the view. */
  #applyEntries(): void {
    const list = this.#phase === 'ready' ? (this.#children.get(folderKey(this.#folder)) ?? []) : [];
    const { sortBy, sortDirection, foldersFirst, locale } = this.#resolved;
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    const dir = sortDirection === 'asc' ? 1 : -1;
    const typeOf = (e: FileEntry): string => (e.kind === 'folder' ? '' : (e.mimeType ?? fileExtension(e.name)));
    const activeId = this.#entries[this.#active]?.id;
    const anchorId = this.#entries[this.#anchor]?.id;
    this.#entries = [...list].sort((a, b) => {
      if (foldersFirst && a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      let c = 0;
      if (sortBy === 'size') c = (a.size ?? -1) - (b.size ?? -1);
      else if (sortBy === 'modified') c = (a.modified?.epochMilliseconds ?? 0) - (b.modified?.epochMilliseconds ?? 0);
      else if (sortBy === 'type') c = collator.compare(typeOf(a), typeOf(b));
      if (c === 0) c = collator.compare(a.name, b.name);
      return c * dir;
    });
    this.#labels = null;
    this.#active = activeId === undefined ? (this.#entries.length > 0 ? Math.min(Math.max(this.#active, 0), this.#entries.length - 1) : -1) : this.#entries.findIndex((e) => e.id === activeId);
    this.#anchor = anchorId === undefined ? -1 : this.#entries.findIndex((e) => e.id === anchorId);
  }

  #selectedPrune(): void {
    for (const id of [...this.#selected]) if (!this.#entries.some((e) => e.id === id)) this.#selected.delete(id);
  }

  // Rendering.

  #rerender(): void {
    this.#applyEntries();
    this.#sortMenu?.update({ items: this.#sortItems() });
    this.#renderChrome();
    this.#syncTree();
    this.#renderState();
    this.#relayout();
  }

  /** Host classes, labels, toolbar, path, columns, and status. */
  #renderChrome(): void {
    const o = this.#options;
    const r = this.#resolved;
    const host = this.host;
    host.setAttribute('aria-label', o.label);
    host.classList.toggle('aui-file-manager--grid', r.view === 'grid');
    host.classList.toggle('aui-file-manager--list', r.view === 'list');
    host.classList.toggle('aui-file-manager--no-pane', !r.showFolderPane);
    host.classList.toggle('aui-file-manager--readonly', this.#readOnly());
    const height = o.height === undefined ? '32rem' : o.height;
    host.classList.toggle('aui-file-manager--fill', height === null);
    if (height === null) host.style.removeProperty('--_aui-file-manager-height');
    else host.style.setProperty('--_aui-file-manager-height', height.trim());
    const tile = TILE_BY_DENSITY[r.density];
    host.style.setProperty('--_aui-file-manager-row', `${String(ROW_BY_DENSITY[r.density])}px`);
    host.style.setProperty('--_aui-file-manager-tile-w', `${String(tile.w)}px`);
    host.style.setProperty('--_aui-file-manager-tile-h', `${String(tile.h)}px`);
    this.#toolbar.setAttribute('aria-label', this.#m('toolbar', { label: o.label }));
    const folderName = this.#path[this.#path.length - 1]?.label ?? o.label;
    this.#viewport.setAttribute('aria-label', folderName);
    this.#content.setAttribute('aria-label', folderName);
    this.#uploadList.setAttribute('aria-label', this.#m('uploads'));
    this.#picker.accept = (o.accept ?? []).join(',');
    this.#breadcrumb?.update({ items: this.#crumbs(), label: this.#m('path') });
    this.#buttons.get('view-list')?.update({ pressed: r.view === 'list' });
    this.#buttons.get('view-grid')?.update({ pressed: r.view === 'grid' });
    this.#columns.hidden = r.view !== 'list' || this.#entries.length === 0;
    for (const [by, b] of this.#columnButtons) {
      const column = this.#m(`sort${by.charAt(0).toUpperCase()}${by.slice(1)}`);
      const sorted = r.sortBy === by;
      b.element.setAttribute('aria-label', sorted ? this.#m(r.sortDirection === 'asc' ? 'sortedAsc' : 'sortedDesc', { column }) : this.#m('sortColumn', { column }));
      const arrow = b.element.querySelector('.aui-file-manager__sort-arrow');
      if (arrow) arrow.textContent = sorted ? (r.sortDirection === 'asc' ? ARROW_UP : ARROW_DOWN) : '';
    }
    this.#viewport.setAttribute('aria-busy', String(this.#phase === 'loading'));
    this.#syncCommands();
    this.#renderStatus();
  }

  #renderStatus(): void {
    const count = this.#entries.length;
    const selected = this.#selected.size;
    let text: string;
    if (this.#phase !== 'ready') text = '';
    else if (selected === 0) text = count === 1 ? this.#m('countOne') : this.#m('count', { count: this.#n(count) });
    else text = count === 1 ? this.#m('countOneSelected') : this.#m('countSelected', { count: this.#n(count), selected: this.#n(selected) });
    if (this.#status.textContent !== text) this.#status.textContent = text;
  }

  /** Loading, empty, and error states (in place of the list). */
  #renderState(): void {
    this.#stateView?.destroy();
    this.#stateView = null;
    const doc = this.#doc;
    const host = doc.createElement('div');
    const empty = this.#phase === 'ready' && this.#entries.length === 0;
    // An empty listbox is not allowed: the state replaces it. While loading, the busy listbox stays (focus is kept).
    this.#viewport.hidden = this.#phase === 'error' || empty;
    this.#state.hidden = this.#phase === 'ready' && !empty;
    if (this.#phase === 'loading') {
      const s = Spinner.create(host, { label: this.#m('loading'), showLabel: true });
      this.#stateView = s;
    } else if (this.#phase === 'error') {
      const e = EmptyState.create(host, { title: this.#m('loadFailed'), description: this.#m('loadFailedHint'), icon: 'alert-circle', size: 'sm', headingLevel: null, live: true, primaryAction: { label: this.#m('retry'), icon: this.#icons().refresh } });
      host.addEventListener('aui-action', () => {
        void this.refresh();
      });
      this.#stateView = e;
    } else if (empty) {
      const readOnly = this.#readOnly();
      const e = EmptyState.create(host, {
        title: this.#m('empty'),
        ...(readOnly ? {} : { description: this.#m('emptyHint'), primaryAction: { label: this.#m('upload'), icon: this.#icons().upload }, secondaryAction: { label: this.#m('newFolder'), icon: this.#icons().newFolder } }),
        icon: this.#icons().folderOpen,
        size: 'sm',
        headingLevel: null,
      });
      host.addEventListener('aui-action', (event) => {
        this.#run((event as CustomEvent<{ action: string }>).detail.action === 'primary' ? 'upload' : 'new-folder');
      });
      this.#stateView = e;
    }
    this.#state.replaceChildren(host);
    this.#columns.hidden = this.#resolved.view !== 'list' || this.#entries.length === 0;
  }

  #schedule(resized = false): void {
    const view = this.#doc.defaultView;
    if (!view) return;
    if (resized) {
      const cols = this.#computeCols();
      if (cols !== this.#cols) {
        this.#relayout();
        return;
      }
    }
    if (this.#frame) return;
    this.#frame = view.requestAnimationFrame(() => {
      this.#frame = 0;
      this.#paint();
    });
  }

  #computeCols(): number {
    if (this.#resolved.view === 'list') return 1;
    const tile = TILE_BY_DENSITY[this.#resolved.density];
    const width = this.#viewport.clientWidth;
    return Math.max(1, Math.floor((width - TILE_GAP) / (tile.w + TILE_GAP)));
  }

  /** Entries, view, density, or width changed: rebuild the window. */
  #relayout(): void {
    const r = this.#resolved;
    this.#cols = this.#computeCols();
    const rowSize = r.view === 'list' ? ROW_BY_DENSITY[r.density] : TILE_BY_DENSITY[r.density].h + TILE_GAP;
    const rowCount = Math.ceil(this.#entries.length / this.#cols);
    this.#win.reset(rowCount, rowSize);
    for (const el of this.#rows.values()) el.remove();
    this.#rows.clear();
    this.#paint();
  }

  #rowOf(index: number): number {
    return Math.floor(index / this.#cols);
  }

  #paint(): void {
    const vp = this.#viewport;
    const view = vp.clientHeight > 0 ? vp.clientHeight : this.#win.estimate * 10;
    const rendered = this.#win.rendered(vp.scrollTop, view, 4);
    const wanted = new Set<number>();
    for (let i = rendered.start; i < rendered.end; i++) wanted.add(i);
    if (this.#active >= 0) wanted.add(this.#rowOf(this.#active));
    for (const [row, el] of [...this.#rows]) {
      if (!wanted.has(row)) {
        el.remove();
        this.#rows.delete(row);
      }
    }
    let added = false;
    for (const row of wanted) {
      if (this.#rows.has(row) || row >= this.#win.count) continue;
      this.#rows.set(row, this.#renderRow(row));
      added = true;
    }
    if (added) {
      const order = [...this.#rows.entries()].sort((a, b) => a[0] - b[0]).map(([, el]) => el);
      this.#canvas.replaceChildren(...order);
    }
    this.#canvas.style.setProperty('--_aui-file-manager-total', `${String(this.#win.total)}px`);
    for (const [row, el] of this.#rows) el.style.setProperty('--_aui-file-manager-y', `${String(this.#win.offsetOf(row))}px`);
    this.#syncOptions();
  }

  #renderRow(row: number): HTMLDivElement {
    const doc = this.#doc;
    const el = doc.createElement('div');
    el.className = 'aui-file-manager__row';
    el.dataset.row = String(row);
    if (this.#resolved.view === 'list') {
      const entry = this.#entries[row];
      if (entry) el.append(this.#renderOption(entry, row));
      return el;
    }
    el.setAttribute('role', 'none');
    const start = row * this.#cols;
    for (let i = start; i < Math.min(start + this.#cols, this.#entries.length); i++) {
      const entry = this.#entries[i];
      if (entry) el.append(this.#renderOption(entry, i));
    }
    return el;
  }

  #iconFor(entry: FileEntry): IconRef {
    const icons = this.#icons();
    if (entry.kind === 'folder') return icons.folder;
    if (this.#isImage(entry)) return icons.image;
    const ext = fileExtension(entry.name);
    if (ext in CODE_EXT) return CODE_EXT[ext] === 'plain' ? icons.text : icons.code;
    return icons.file;
  }

  #typeText(entry: FileEntry): string {
    if (entry.kind === 'folder') return this.#m('folder');
    const ext = fileExtension(entry.name);
    return ext === '' ? this.#m('file') : this.#m('fileType', { ext: ext.slice(1).toUpperCase() });
  }

  #renderOption(entry: FileEntry, index: number): HTMLDivElement {
    const doc = this.#doc;
    const r = this.#resolved;
    const el = doc.createElement('div');
    el.className = `aui-file-manager__item aui-file-manager__item--${entry.kind}`;
    el.setAttribute('role', 'option');
    el.id = `${this.#id}-o-${String(index)}`;
    el.dataset.index = String(index);
    el.setAttribute('aria-posinset', String(index + 1));
    el.setAttribute('aria-setsize', String(this.#entries.length));
    el.draggable = !this.#readOnly() && entry.readOnly !== true;
    const icon = renderIcon(this.#iconFor(entry), { doc, className: 'aui-file-manager__icon' });
    icon.setAttribute('aria-hidden', 'true');
    const name = doc.createElement('span');
    name.className = 'aui-file-manager__name';
    name.textContent = entry.name;
    el.append(icon, name);
    if (r.view === 'list') {
      const cell = (cls: string, text: string): HTMLSpanElement => {
        const s = doc.createElement('span');
        s.className = `aui-file-manager__cell aui-file-manager__cell--${cls}`;
        s.textContent = text;
        return s;
      };
      el.append(
        cell('size', entry.kind === 'file' && entry.size !== undefined ? formatFileSize(entry.size, r.locale) : ''),
        cell('modified', entry.modified ? formatInstant(entry.modified, { dateStyle: 'medium', timeStyle: 'short' }, r.timezone, r.locale) : ''),
        cell('type', this.#typeText(entry)),
      );
    } else {
      el.title = entry.name;
    }
    return el;
  }

  /** Selection, activity, and cut state of the rendered options. */
  #syncOptions(): void {
    let activeEl: HTMLElement | null = null;
    for (const el of this.#canvas.querySelectorAll<HTMLElement>('.aui-file-manager__item')) {
      const index = Number(el.dataset.index);
      const entry = this.#entries[index];
      if (!entry) continue;
      const selected = this.#selected.has(entry.id);
      el.setAttribute('aria-selected', String(selected));
      el.classList.toggle('aui-file-manager__item--selected', selected);
      el.classList.toggle('aui-file-manager__item--active', index === this.#active);
      el.classList.toggle('aui-file-manager__item--cut', this.#cut?.has(entry.id) === true);
      if (index === this.#active) activeEl = el;
    }
    if (activeEl) this.#viewport.setAttribute('aria-activedescendant', activeEl.id);
    else this.#viewport.removeAttribute('aria-activedescendant');
  }

  /** Everything that depends on the selection. */
  #sync(): void {
    this.#syncOptions();
    this.#syncCommands();
    this.#renderStatus();
  }

  #selectedEntries(): FileEntry[] {
    return this.#entries.filter((e) => this.#selected.has(e.id));
  }

  #can(command: Command): boolean {
    const ro = this.#readOnly();
    const ready = this.#phase === 'ready';
    const sel = this.#selectedEntries();
    const mutable = sel.length > 0 && sel.every((e) => e.readOnly !== true);
    switch (command) {
      case 'up':
        return this.#folder !== this.#root().id;
      case 'new-folder':
      case 'upload':
        return !ro && ready;
      case 'rename':
        return !ro && sel.length === 1 && mutable;
      case 'delete':
      case 'cut':
        return !ro && mutable;
      case 'paste':
        return !ro && ready && this.#cut !== null && this.#cut.size > 0 && this.#canMoveInto([...this.#cut], this.#folder);
      case 'paste-into': {
        const target = sel.length === 1 && sel[0]?.kind === 'folder' ? sel[0] : null;
        return !ro && target !== null && this.#cut !== null && this.#cut.size > 0 && this.#canMoveInto([...this.#cut], target.id);
      }
      case 'open':
        return sel.length === 1;
      case 'refresh':
        return true;
    }
  }

  #syncCommands(): void {
    for (const [id, b] of this.#buttons) {
      if (!isCommand(id)) continue;
      const disabled = !this.#can(id);
      if (b.element.disabled !== disabled) b.update({ disabled });
    }
    // One toolbar button is in the tab order (roving tabindex).
    const buttons = [...this.#toolbar.querySelectorAll<HTMLButtonElement>('button[data-command]')].filter((b) => !b.disabled);
    if (!buttons.some((b) => b.tabIndex === 0)) {
      for (const b of buttons) b.tabIndex = -1;
      const first = buttons[0];
      if (first) first.tabIndex = 0;
    }
    for (const b of this.#toolbar.querySelectorAll<HTMLButtonElement>('button[data-command]')) if (b.disabled) b.tabIndex = -1;
    this.#contextMenu?.update({ items: this.#contextItems() });
  }

  #contextItems(): MenuItem[] {
    const icons = this.#icons();
    const item = (id: Command, label: string, icon?: IconRef, extra: { shortcut?: string; tone?: 'danger' } = {}): MenuItem => ({ id, label, ...(icon === undefined ? {} : { icon }), disabled: !this.#can(id), ...extra });
    if (this.#selected.size > 0) {
      return [
        item('open', this.#m('open'), undefined, { shortcut: 'Enter' }),
        item('rename', this.#m('rename'), icons.rename, { shortcut: 'F2' }),
        item('cut', this.#m('cut'), icons.cut, { shortcut: 'Ctrl+X' }),
        item('paste-into', this.#m('pasteInto'), icons.paste),
        { type: 'separator' },
        item('delete', this.#m('delete'), icons.delete, { shortcut: 'Delete', tone: 'danger' }),
      ];
    }
    return [
      item('new-folder', this.#m('newFolder'), icons.newFolder, { shortcut: 'Ctrl+Shift+N' }),
      item('upload', this.#m('upload'), icons.upload),
      item('paste', this.#m('paste'), icons.paste, { shortcut: 'Ctrl+V' }),
      { type: 'separator' },
      item('refresh', this.#m('refresh'), icons.refresh),
    ];
  }

  // Selection and keyboard.

  #indexOf(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const el = target.closest<HTMLElement>('.aui-file-manager__item');
    if (!el || !this.#canvas.contains(el)) return -1;
    const index = Number(el.dataset.index);
    return Number.isInteger(index) ? index : -1;
  }

  #setSelection(ids: readonly string[], active: number, notify: boolean): void {
    const before = [...this.#selected];
    this.#selected.clear();
    for (const id of ids) this.#selected.add(id);
    this.#active = active;
    this.#scrollToActive();
    this.#sync();
    const changed = before.length !== this.#selected.size || before.some((id) => !this.#selected.has(id));
    if (notify && changed) emit(this.host, 'aui-change', { selected: this.selected } satisfies FileManagerChangeDetail);
  }

  #scrollToActive(): void {
    if (this.#active < 0) return;
    const vp = this.#viewport;
    vp.scrollTop = this.#win.scrollFor(this.#rowOf(this.#active), vp.scrollTop, vp.clientHeight, 'auto');
    this.#paint();
  }

  #range(from: number, to: number): string[] {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    return this.#entries.slice(lo, hi + 1).map((e) => e.id);
  }

  #onClick(event: MouseEvent): void {
    const index = this.#indexOf(event.target);
    this.#viewport.focus({ preventScroll: true });
    if (index < 0) {
      if (event.target === this.#viewport || event.target === this.#canvas) this.#setSelection([], this.#active, true);
      return;
    }
    const entry = this.#entries[index];
    if (!entry) return;
    if (event.shiftKey) {
      const anchor = this.#anchor < 0 ? index : this.#anchor;
      this.#setSelection(this.#range(anchor, index), index, true);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const ids = new Set(this.#selected);
      if (ids.has(entry.id)) ids.delete(entry.id);
      else ids.add(entry.id);
      this.#anchor = index;
      this.#setSelection([...ids], index, true);
      return;
    }
    this.#anchor = index;
    this.#setSelection([entry.id], index, true);
  }

  #onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    const count = this.#entries.length;
    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (mod && event.shiftKey && lower === 'n') {
      handled();
      this.#run('new-folder');
      return;
    }
    if (mod && !event.shiftKey && lower === 'a') {
      handled();
      this.#setSelection(this.#entries.map((e) => e.id), this.#active, true);
      return;
    }
    if (mod && lower === 'x') {
      handled();
      this.#run('cut');
      return;
    }
    if (mod && lower === 'v') {
      handled();
      this.#run('paste');
      return;
    }
    if (key === 'F2' && !mod) {
      handled();
      this.#run('rename');
      return;
    }
    if (key === 'Delete' && !mod) {
      handled();
      this.#run('delete');
      return;
    }
    if (key === 'Backspace' || (event.altKey && key === 'ArrowUp')) {
      handled();
      this.#run('up');
      return;
    }
    if (key === 'Escape') {
      if (this.#cut) {
        handled();
        this.#cut = null;
        this.#sync();
      } else if (this.#selected.size > 0) {
        handled();
        this.#setSelection([], this.#active, true);
      }
      return;
    }
    if (count === 0) return;
    const current = this.#active < 0 ? 0 : this.#active;
    if (key === 'Enter') {
      handled();
      const entry = this.#entries[current];
      if (entry) this.#open(entry);
      return;
    }
    if (key === ' ') {
      handled();
      const entry = this.#entries[current];
      if (!entry) return;
      if (mod) {
        const ids = new Set(this.#selected);
        if (ids.has(entry.id)) ids.delete(entry.id);
        else ids.add(entry.id);
        this.#anchor = current;
        this.#setSelection([...ids], current, true);
      } else if (event.shiftKey) this.#setSelection(this.#range(this.#anchor < 0 ? current : this.#anchor, current), current, true);
      else {
        this.#anchor = current;
        this.#setSelection([entry.id], current, true);
      }
      return;
    }
    const next = this.#nextIndex(event, current, count);
    if (next === null) {
      if (key.length === 1 && !mod && !event.altKey) {
        this.#labels ??= this.#entries.map((e) => e.name);
        const found = this.#typeahead.handle(key, this.#labels, current);
        if (found >= 0) {
          handled();
          const entry = this.#entries[found];
          this.#anchor = found;
          if (entry) this.#setSelection([entry.id], found, true);
        }
      }
      return;
    }
    handled();
    if (event.shiftKey) this.#setSelection(this.#range(this.#anchor < 0 ? current : this.#anchor, next), next, true);
    else if (mod) {
      this.#active = next;
      this.#scrollToActive();
      this.#syncOptions();
    } else {
      this.#anchor = next;
      const entry = this.#entries[next];
      if (entry) this.#setSelection([entry.id], next, true);
    }
  }

  #nextIndex(event: KeyboardEvent, current: number, count: number): number | null {
    const cols = this.#cols;
    const rtl = getComputedStyle(this.host).direction === 'rtl';
    const view = this.#viewport.clientHeight;
    const pageRows = Math.max(1, Math.floor(view / this.#win.estimate) - 1);
    const clamp = (i: number): number => Math.max(0, Math.min(count - 1, i));
    switch (event.key) {
      case 'ArrowDown':
        return clamp(current + cols);
      case 'ArrowUp':
        return clamp(current - cols);
      case 'ArrowRight':
        return this.#resolved.view === 'grid' ? clamp(current + (rtl ? -1 : 1)) : null;
      case 'ArrowLeft':
        return this.#resolved.view === 'grid' ? clamp(current + (rtl ? 1 : -1)) : null;
      case 'Home':
        return 0;
      case 'End':
        return count - 1;
      case 'PageDown':
        return clamp(current + pageRows * cols);
      case 'PageUp':
        return clamp(current - pageRows * cols);
      default:
        return null;
    }
  }

  #setView(view: FileManagerView): void {
    this.#options = { ...this.#options, view };
    this.#resolved = this.#resolve();
    this.#renderChrome();
    this.#renderState();
    this.#relayout();
    this.#scrollToActive();
  }

  #setSort(sortBy: FileManagerSortBy, sortDirection: FileManagerSortDirection, foldersFirst: boolean): void {
    this.#options = { ...this.#options, sortBy, sortDirection, foldersFirst };
    this.#resolved = this.#resolve();
    this.#applyEntries();
    this.#sortMenu?.update({ items: this.#sortItems() });
    this.#renderChrome();
    this.#relayout();
    this.#scrollToActive();
  }

  #onSort(detail: MenuSelectDetail): void {
    const r = this.#resolved;
    const by = SORTS.find((s) => detail.id === `sort-${s}`);
    if (by) this.#setSort(by, r.sortDirection, r.foldersFirst);
    else if (detail.id === 'dir-asc' || detail.id === 'dir-desc') this.#setSort(r.sortBy, detail.id === 'dir-asc' ? 'asc' : 'desc', r.foldersFirst);
    else if (detail.id === 'folders-first') this.#setSort(r.sortBy, r.sortDirection, !r.foldersFirst);
  }

  // Commands.

  #run(command: Command): void {
    if (!this.#can(command)) return;
    switch (command) {
      case 'up': {
        const parent = this.#path[this.#path.length - 2];
        if (parent) void this.#load(parent.id, this.#folder);
        return;
      }
      case 'new-folder':
        void this.#createFolder();
        return;
      case 'upload':
        this.#picker.click();
        return;
      case 'rename': {
        const entry = this.#selectedEntries()[0];
        if (entry) void this.#rename(entry);
        return;
      }
      case 'delete':
        void this.#delete(this.#selectedEntries());
        return;
      case 'cut': {
        const ids = this.#selectedEntries().map((e) => e.id);
        this.#cut = new Set(ids);
        this.#sync();
        announce(this.#m('cutDone', { count: this.#n(ids.length) }), 'polite', this.#doc);
        return;
      }
      case 'paste':
        if (this.#cut) void this.#move([...this.#cut], this.#folder, 'paste');
        return;
      case 'paste-into': {
        const target = this.#selectedEntries()[0];
        if (this.#cut && target) void this.#move([...this.#cut], target.id, 'paste');
        return;
      }
      case 'open': {
        const entry = this.#selectedEntries()[0];
        if (entry) this.#open(entry);
        return;
      }
      case 'refresh':
        void this.refresh();
        return;
    }
  }

  /** An operation with its own abort controller (aborted by destroy). */
  async #op<T>(run: (signal: AbortSignal) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> {
    const controller = new AbortController();
    this.#ops.add(controller);
    try {
      const value = await run(controller.signal);
      if (controller.signal.aborted || this.#group.disposed) return null;
      return { ok: true, value };
    } catch (error) {
      if (controller.signal.aborted || this.#group.disposed) return null;
      return { ok: false, error };
    } finally {
      this.#ops.delete(controller);
    }
  }

  #fail(operation: FileManagerOperation, error: unknown, entries: readonly FileEntry[], message?: string): void {
    if (message !== undefined) this.#showMessage(message);
    emit(this.host, 'aui-error', { operation, error, entries: [...entries] } satisfies FileManagerErrorDetail);
  }

  #showMessage(text: string): void {
    this.#hideMessage();
    const inlineHost = this.#doc.createElement('div');
    const inline = InlineMessage.create(inlineHost, { tone: 'error', message: text, live: 'assertive' });
    const dismiss = Button.create({ text: this.#m('dismiss'), variant: 'ghost', size: 'sm' }, this.#doc);
    dismiss.element.addEventListener('click', () => {
      this.#hideMessage();
      this.#viewport.focus({ preventScroll: true });
    });
    this.#messageView = { inline, dismiss };
    this.#message.replaceChildren(inlineHost, dismiss.element);
    this.#message.hidden = false;
  }

  #hideMessage(): void {
    if (!this.#messageView) return;
    this.#messageView.inline.destroy();
    this.#messageView.dismiss.destroy();
    this.#messageView = null;
    this.#message.replaceChildren();
    this.#message.hidden = true;
  }

  /** Validation of a new name in the current folder. */
  #nameError(raw: string, exceptId: string | null): string | null {
    const name = raw.trim();
    if (name === '') return this.#m('nameEmpty');
    if (/[/\\]/.test(name) || name === '.' || name === '..' || hasControl(name)) return this.#m('nameInvalid');
    if (name.length > MAX_NAME) return this.#m('nameTooLong', { max: this.#n(MAX_NAME) });
    const collator = new Intl.Collator(this.#resolved.locale, { sensitivity: 'base' });
    const siblings = this.#children.get(folderKey(this.#folder)) ?? [];
    if (siblings.some((e) => e.id !== exceptId && collator.compare(e.name, name) === 0)) return this.#m('nameTaken', { name });
    return null;
  }

  #uniqueName(base: string): string {
    let name = base;
    for (let i = 2; this.#nameError(name, null) !== null && i < 1000; i++) name = `${base} (${String(i)})`;
    return name;
  }

  /** A modal name prompt: resolves with the trimmed name, or null when canceled. */
  #promptName(title: string, initial: string, okLabel: string, exceptId: string | null): Promise<string | null> {
    return new Promise((resolve) => {
      const doc = this.#doc;
      const content = doc.createElement('div');
      const input = TextInput.create(content, {
        label: this.#m('nameLabel'),
        value: initial,
        required: true,
        maxLength: MAX_NAME,
        validationTiming: 'input',
        validate: (value) => this.#nameError(value, exceptId),
        ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }),
      });
      const dialog = Dialog.create({ title, content, size: 'sm', actions: [{ label: this.#m('cancel'), value: 'cancel' }, { label: okLabel, value: 'ok', variant: 'primary' }] }, doc);
      this.#dialogs.add(dialog);
      dialog.element.addEventListener('aui-cancel', (event) => {
        const detail = (event as CustomEvent<DialogCloseDetail>).detail;
        if (detail.returnValue === 'ok' && !input.reportValidity()) {
          event.preventDefault();
          input.focus();
        }
      });
      input.input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        if (input.reportValidity()) dialog.close('ok');
      });
      dialog.element.addEventListener('aui-close', (event) => {
        const ok = (event as CustomEvent<DialogCloseDetail>).detail.returnValue === 'ok';
        const value = input.value.trim();
        resolve(ok && this.#nameError(value, exceptId) === null ? value : null);
        setTimeout(() => {
          input.destroy();
          dialog.destroy();
          this.#dialogs.delete(dialog);
        }, 0);
      });
      dialog.open();
      input.focus();
      // Select the name without its extension, as desktop file managers do.
      const dot = initial.lastIndexOf('.');
      input.input.setSelectionRange(0, dot > 0 ? dot : initial.length);
    });
  }

  #confirmDelete(entries: readonly FileEntry[]): Promise<boolean> {
    return new Promise((resolve) => {
      const first = entries[0];
      const title = entries.length === 1 && first ? this.#m('deleteTitle', { name: first.name }) : this.#m('deleteTitleMany', { count: this.#n(entries.length) });
      const dialog = Dialog.create({
        title,
        description: this.#m('deleteText'),
        role: 'alertdialog',
        size: 'sm',
        actions: [{ label: this.#m('cancel'), value: 'cancel', autofocus: true }, { label: this.#m('delete'), value: 'delete', variant: 'danger' }],
      }, this.#doc);
      this.#dialogs.add(dialog);
      dialog.element.addEventListener('aui-close', (event) => {
        resolve((event as CustomEvent<DialogCloseDetail>).detail.returnValue === 'delete');
        setTimeout(() => {
          dialog.destroy();
          this.#dialogs.delete(dialog);
        }, 0);
      });
      dialog.open();
    });
  }

  /** Replace the cache and view after a change in `folderId`, keeping the selection on `select`. */
  #changed(select: readonly string[], focus = true): void {
    this.#applyEntries();
    if (select.length > 0) {
      const ids = select.filter((id) => this.#entries.some((e) => e.id === id));
      const active = this.#entries.findIndex((e) => e.id === ids[0]);
      this.#selected.clear();
      for (const id of ids) this.#selected.add(id);
      if (active >= 0) this.#active = active;
    }
    this.#selectedPrune();
    this.#renderChrome();
    this.#syncTree();
    this.#renderState();
    this.#relayout();
    this.#scrollToActive();
    if (focus && this.#entries.length > 0) this.#viewport.focus({ preventScroll: true });
  }

  async #createFolder(): Promise<void> {
    const parentId = this.#folder;
    const name = await this.#promptName(this.#m('newFolderTitle'), this.#uniqueName(this.#m('newFolderName')), this.#m('create'), null);
    if (name === null) {
      this.#viewport.focus({ preventScroll: true });
      return;
    }
    const result = await this.#op((signal) => this.#options.provider.createFolder(parentId, name, { signal }).then(checkEntry));
    if (!result) return;
    if (!result.ok) {
      this.#fail('create-folder', result.error, [], this.#m('errorCreate'));
      return;
    }
    const entry = result.value;
    this.#known.set(entry.id, entry);
    const list = this.#children.get(folderKey(parentId));
    if (list) list.push(entry);
    this.#hideMessage();
    if (parentId === this.#folder) this.#changed([entry.id]);
    else this.#syncTree();
    announce(this.#m('created', { name: entry.name }), 'polite', this.#doc);
    emit(this.host, 'aui-create-folder', { entry } satisfies FileManagerCreateFolderDetail);
  }

  async #rename(entry: FileEntry): Promise<void> {
    const name = await this.#promptName(this.#m('renameTitle', { name: entry.name }), entry.name, this.#m('save'), entry.id);
    if (name === null || name === entry.name) {
      this.#viewport.focus({ preventScroll: true });
      return;
    }
    const result = await this.#op((signal) => this.#options.provider.rename(entry, name, { signal }).then(checkEntry));
    if (!result) return;
    if (!result.ok) {
      this.#fail('rename', result.error, [entry], this.#m('errorRename'));
      return;
    }
    const renamed = result.value;
    this.#known.set(renamed.id, renamed);
    this.#replaceInCache(entry.id, renamed);
    this.#hideMessage();
    this.#path = this.#pathTo(this.#folder);
    this.#changed([renamed.id]);
    announce(this.#m('renamed', { name: renamed.name }), 'polite', this.#doc);
    emit(this.host, 'aui-rename', { entry: renamed, previousName: entry.name } satisfies FileManagerRenameDetail);
  }

  #replaceInCache(id: string, next: FileEntry | null): void {
    for (const list of this.#children.values()) {
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) continue;
      if (next) list[i] = next;
      else list.splice(i, 1);
    }
  }

  async #delete(entries: readonly FileEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const confirmed = await this.#confirmDelete(entries);
    if (!confirmed) {
      this.#viewport.focus({ preventScroll: true });
      return;
    }
    const result = await this.#op((signal) => this.#options.provider.delete(entries, { signal }));
    if (!result) return;
    if (!result.ok) {
      this.#fail('delete', result.error, entries, this.#m('errorDelete'));
      return;
    }
    for (const e of entries) {
      this.#replaceInCache(e.id, null);
      this.#known.delete(e.id);
      if (e.kind === 'folder') this.#children.delete(folderKey(e.id));
      this.#cut?.delete(e.id);
    }
    const first = entries[0];
    const nextActive = Math.min(this.#active, this.#entries.length - 1 - entries.length);
    this.#hideMessage();
    this.#selected.clear();
    this.#changed([]);
    if (nextActive >= 0) {
      this.#active = nextActive;
      this.#syncOptions();
    }
    announce(entries.length === 1 && first ? this.#m('deletedOne', { name: first.name }) : this.#m('deleted', { count: this.#n(entries.length) }), 'polite', this.#doc);
    emit(this.host, 'aui-delete', { entries: [...entries] } satisfies FileManagerDeleteDetail);
    emit(this.host, 'aui-change', { selected: [] } satisfies FileManagerChangeDetail);
  }

  /** Moving `ids` into `targetId` is possible: not into themselves, a descendant, or where they already are. */
  #canMoveInto(ids: readonly string[], targetId: string | null): boolean {
    if (ids.length === 0) return false;
    let anywhere = false;
    for (const id of ids) {
      const entry = this.#known.get(id);
      if (!entry || entry.readOnly === true) return false;
      if (entry.kind === 'folder' && targetId !== null && this.#isDescendantOrSelf(targetId, entry.id)) return false;
      if (entry.parentId !== targetId) anywhere = true;
    }
    return anywhere;
  }

  #folderName(id: string | null): string {
    if (id === this.#root().id) return this.#root().label;
    return (id === null ? undefined : this.#known.get(id)?.name) ?? '';
  }

  async #move(ids: readonly string[], targetId: string | null, source: 'drag' | 'paste'): Promise<void> {
    if (!this.#canMoveInto(ids, targetId)) {
      this.#showMessage(this.#m('errorMoveInto'));
      return;
    }
    const entries = ids.map((id) => this.#known.get(id)).filter((e): e is FileEntry => e !== undefined && e.parentId !== targetId);
    const result = await this.#op((signal) => this.#options.provider.move(entries, targetId, { signal }).then(checkEntries));
    if (!result) return;
    if (!result.ok) {
      this.#fail('move', result.error, entries, this.#m('errorMove'));
      return;
    }
    const moved = result.value;
    for (const e of entries) this.#replaceInCache(e.id, null);
    const target = this.#children.get(folderKey(targetId));
    for (const e of moved) {
      this.#known.set(e.id, e);
      if (target && e.parentId === targetId && !target.some((t) => t.id === e.id)) target.push(e);
    }
    if (source === 'paste') this.#cut = null;
    this.#hideMessage();
    const select = targetId === this.#folder ? moved.map((e) => e.id) : [];
    if (select.length === 0) this.#selected.clear();
    this.#changed(select);
    const folder = this.#folderName(targetId);
    const first = moved[0];
    announce(moved.length === 1 && first ? this.#m('movedOne', { name: first.name, folder }) : this.#m('moved', { count: this.#n(moved.length), folder }), 'polite', this.#doc);
    emit(this.host, 'aui-move', { entries: [...moved], targetFolderId: targetId, source } satisfies FileManagerMoveDetail);
  }

  // Drag and drop.

  #onDragStart(event: DragEvent): void {
    const index = this.#indexOf(event.target);
    const entry = this.#entries[index];
    if (!entry || !event.dataTransfer || this.#readOnly()) return;
    if (!this.#selected.has(entry.id)) this.#setSelection([entry.id], index, true);
    const ids = this.#selectedEntries().filter((e) => e.readOnly !== true).map((e) => e.id);
    if (ids.length === 0) {
      event.preventDefault();
      return;
    }
    this.#dragIds = ids;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
    event.dataTransfer.setData('text/plain', this.#selectedEntries().map((e) => e.name).join('\n'));
  }

  /** The folder under the pointer (a folder option or a tree item), the current folder, or undefined. */
  #dropTarget(event: DragEvent): { folderId: string | null; el: HTMLElement | null } | undefined {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return undefined;
    const treeItem = target.closest<HTMLElement>('[role="treeitem"][data-id]');
    if (treeItem && this.#treeHost.contains(treeItem)) {
      const id = treeItem.dataset.id;
      return id === undefined ? undefined : { folderId: this.#fromTree(id), el: treeItem };
    }
    if (!this.#content.contains(target)) return undefined;
    const entry = this.#entries[this.#indexOf(target)];
    if (entry?.kind === 'folder') {
      const el = target.closest<HTMLElement>('.aui-file-manager__item');
      return { folderId: entry.id, el };
    }
    return { folderId: this.#folder, el: null };
  }

  #onDragOver(event: DragEvent): void {
    const dt = event.dataTransfer;
    if (!dt || this.#readOnly()) return;
    const files = dt.types.includes('Files');
    const internal = this.#dragIds !== null && dt.types.includes(DRAG_TYPE);
    if (!files && !internal) return;
    const target = this.#dropTarget(event);
    if (!target) return;
    if (internal && !this.#canMoveInto(this.#dragIds ?? [], target.folderId)) {
      dt.dropEffect = 'none';
      this.#clearDrop();
      return;
    }
    event.preventDefault();
    dt.dropEffect = internal ? 'move' : 'copy';
    this.#clearDrop();
    if (target.el) target.el.classList.add('aui-file-manager__drop-target');
    else this.#content.classList.add('aui-file-manager__content--drop');
  }

  #clearDrop(): void {
    this.#content.classList.remove('aui-file-manager__content--drop');
    for (const el of this.host.querySelectorAll('.aui-file-manager__drop-target')) el.classList.remove('aui-file-manager__drop-target');
  }

  #onDrop(event: DragEvent): void {
    const dt = event.dataTransfer;
    this.#clearDrop();
    if (!dt || this.#readOnly()) return;
    const target = this.#dropTarget(event);
    if (!target) return;
    const ids = this.#dragIds;
    if (ids !== null && dt.types.includes(DRAG_TYPE)) {
      event.preventDefault();
      this.#dragIds = null;
      void this.#move(ids, target.folderId, 'drag');
      return;
    }
    if (dt.files.length > 0) {
      event.preventDefault();
      this.#startUploads([...dt.files], target.folderId);
    }
  }

  // Uploads.

  #rejection(file: File): string | null {
    const o = this.#options;
    const accept = o.accept ?? [];
    if (accept.length > 0) {
      const types = accept.filter((a) => !a.startsWith('.'));
      const exts = accept.filter((a) => a.startsWith('.'));
      if (!matchesMimeType(file.type, types) && !matchesExtension(file.name, exts)) return this.#m('uploadRejectedType', { name: file.name });
    }
    if (o.maxFileSize !== undefined && file.size > o.maxFileSize) return this.#m('uploadRejectedSize', { name: file.name, max: formatFileSize(o.maxFileSize, this.#resolved.locale) });
    return null;
  }

  #startUploads(files: readonly File[], folderId: string | null): void {
    if (this.#readOnly()) return;
    const rejected: string[] = [];
    for (const file of files) {
      const reason = this.#rejection(file);
      if (reason === null) void this.#uploadOne(file, folderId);
      else rejected.push(reason);
    }
    if (rejected.length > 0) this.#showMessage(rejected.join(' '));
  }

  async #uploadOne(file: File, folderId: string | null): Promise<void> {
    const doc = this.#doc;
    const li = doc.createElement('li');
    li.className = 'aui-file-manager__upload';
    const barHost = doc.createElement('div');
    barHost.className = 'aui-file-manager__upload-bar';
    const bar = ProgressBar.create(barHost, { label: file.name, value: 0, ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }) });
    const button = Button.create({ text: this.#m('cancel'), label: this.#m('cancelUpload', { name: file.name }), variant: 'ghost', size: 'sm' }, doc);
    const abort = new AbortController();
    const row: UploadRow = { el: li, bar, button, abort, done: false };
    const remove = (): void => {
      this.#uploads.delete(row);
      bar.destroy();
      button.destroy();
      li.remove();
      this.#uploadList.hidden = this.#uploads.size === 0;
    };
    button.element.addEventListener('click', () => {
      if (row.done) {
        remove();
        return;
      }
      abort.abort();
      remove();
      announce(this.#m('uploadCancelled', { name: file.name }), 'polite', doc);
    });
    li.append(barHost, button.element);
    this.#uploads.add(row);
    this.#uploadList.append(li);
    this.#uploadList.hidden = false;
    announce(this.#m('uploading', { name: file.name }), 'polite', doc);
    this.#ops.add(abort);
    let entry: FileEntry;
    try {
      entry = checkEntry(await this.#options.provider.upload(folderId, file, {
        signal: abort.signal,
        onProgress: (loaded, total) => {
          if (abort.signal.aborted || row.done || !(total > 0)) return;
          bar.setValue(Math.max(0, Math.min(100, Math.round((loaded / total) * 100))));
        },
      }));
    } catch (error) {
      this.#ops.delete(abort);
      if (abort.signal.aborted || this.#group.disposed) return;
      row.done = true;
      bar.update({ tone: 'error', description: this.#m('uploadFailed', { name: file.name }) });
      button.update({ label: this.#m('dismissUpload', { name: file.name }) });
      button.element.textContent = this.#m('dismiss');
      announce(this.#m('uploadFailed', { name: file.name }), 'assertive', doc);
      this.#fail('upload', error, []);
      return;
    }
    this.#ops.delete(abort);
    if (abort.signal.aborted || this.#group.disposed) return;
    row.done = true;
    remove();
    this.#known.set(entry.id, entry);
    const list = this.#children.get(folderKey(folderId));
    if (list && !list.some((e) => e.id === entry.id)) list.push(entry);
    if (folderId === this.#folder) {
      this.#changed([...this.#selected], false);
    } else this.#syncTree();
    announce(this.#m('uploaded', { name: file.name }), 'polite', doc);
    emit(this.host, 'aui-upload', { entry, file } satisfies FileManagerUploadDetail);
  }

  // Opening and previews.

  #isImage(entry: FileEntry): boolean {
    const mime = entry.mimeType?.toLowerCase() ?? '';
    if (mime.startsWith('image/')) return mime !== 'image/svg+xml';
    return IMAGE_EXT.has(fileExtension(entry.name));
  }

  #language(entry: FileEntry): CodeLanguage | null {
    const lang = CODE_EXT[fileExtension(entry.name)];
    if (lang) return lang;
    const mime = entry.mimeType?.toLowerCase() ?? '';
    if (mime === 'application/json') return 'json';
    return mime.startsWith('text/') ? 'plain' : null;
  }

  #open(entry: FileEntry): void {
    if (entry.kind === 'folder') {
      void this.#load(entry.id, null);
      return;
    }
    const proceed = emit(this.host, 'aui-open', { entry } satisfies FileManagerOpenDetail, { cancelable: true });
    if (!proceed) return;
    void this.#preview(entry);
  }

  async #preview(entry: FileEntry): Promise<void> {
    const preview = this.#options.preview ?? 'auto';
    if (preview === false) return;
    const provider = this.#options.provider;
    const failed = (error: unknown): void => {
      this.#fail('preview', error, [entry], this.#m('errorPreview', { name: entry.name }));
    };
    if (typeof preview === 'function') {
      const result = await this.#op((signal) => Promise.resolve(preview(entry, { signal, provider })));
      if (!result) return;
      if (!result.ok) failed(result.error);
      else if (result.value) this.#showDialog(entry.name, result.value, null);
      return;
    }
    if (this.#isImage(entry) && provider.getUrl) {
      const getUrl = provider.getUrl.bind(provider);
      const result = await this.#op((signal) => getUrl(entry, { signal }));
      if (!result) return;
      if (!result.ok) {
        failed(result.error);
        return;
      }
      try {
        const viewer = ImageViewer.create(this.#lightbox, { label: entry.name, images: [{ src: result.value, alt: entry.name, downloadName: entry.name }], mode: 'lightbox', showThumbnails: false });
        this.#viewers.add(viewer);
        this.#lightbox.addEventListener('aui-close', () => {
          setTimeout(() => {
            viewer.destroy();
            this.#viewers.delete(viewer);
          }, 0);
        }, { once: true });
        viewer.open();
      } catch (error) {
        failed(error);
      }
      return;
    }
    const language = this.#language(entry);
    if (language !== null && provider.read) {
      const read = provider.read.bind(provider);
      const result = await this.#op((signal) => read(entry, { signal }));
      if (!result) return;
      if (!result.ok || typeof result.value !== 'string') {
        failed(result.ok ? providerError() : result.error);
        return;
      }
      const host = this.#doc.createElement('div');
      const code = CodeViewer.create(host, { label: entry.name, code: result.value, language, filename: entry.name, maxHeight: '60vh', ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }) });
      this.#viewers.add(code);
      this.#showDialog(entry.name, host, code);
    }
  }

  #showDialog(title: string, content: Node, viewer: CodeViewer | null): void {
    const dialog = Dialog.create({ title, content, size: 'lg', actions: [{ label: this.#m('dismiss'), value: 'close', variant: 'primary' }] }, this.#doc);
    this.#dialogs.add(dialog);
    dialog.element.addEventListener('aui-close', () => {
      setTimeout(() => {
        if (viewer) {
          viewer.destroy();
          this.#viewers.delete(viewer);
        }
        dialog.destroy();
        this.#dialogs.delete(dialog);
      }, 0);
    });
    dialog.open();
  }
}
