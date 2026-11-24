# File Manager

> Package: `@absoluteui/components/file-manager` | Styles: `@absoluteui/components/button/style.css`, `@absoluteui/components/breadcrumb/style.css`, `@absoluteui/components/tree-view/style.css`, `@absoluteui/components/splitter/style.css`, `@absoluteui/components/menu/style.css`, `@absoluteui/components/context-menu/style.css`, `@absoluteui/components/dialog/style.css`, `@absoluteui/components/text-input/style.css`, `@absoluteui/components/empty-state/style.css`, `@absoluteui/components/spinner/style.css`, `@absoluteui/components/inline-message/style.css`, `@absoluteui/components/progress-bar/style.css`, `@absoluteui/components/image-viewer/style.css`, `@absoluteui/components/code-viewer/style.css`, and `@absoluteui/components/file-manager/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Browses and organizes files held by a host-supplied async provider. A folder tree (Tree View, folders loaded lazily) and the folder content sit side by side in a Splitter, under a toolbar and a breadcrumb path. The content has list and grid views, sorting, multiple selection, rename, new folder, delete with confirmation, move by drag and drop or cut and paste, uploads with progress and cancel, and previews: images open in an Image Viewer lightbox, text and code in a Code Viewer dialog, and anything else through your own preview function. All data goes through the provider (`list`, `createFolder`, `rename`, `move`, `delete`, `upload`, optional `getUrl` and `read`), and every call receives an `AbortSignal`.

## 2. Anatomy

```text
<div class="aui-file-manager aui-file-manager--list" role="region" aria-label="Employee documents">
  <div class="aui-file-manager__toolbar" role="toolbar" aria-label="Employee documents actions">
    <button>Up</button> <button>New folder</button> <button>Upload</button> <button>Rename</button> ... <button aria-pressed="true">List view</button>
  </div>
  <div class="aui-file-manager__path"><nav class="aui-breadcrumb__nav">Documents > Contracts</nav></div>
  <div class="aui-file-manager__message"></div>                                  (operation errors)
  <div class="aui-file-manager__body aui-splitter">
    <div class="aui-file-manager__folders"><div role="tree" aria-label="Folders">...</div></div>
    <div role="separator" aria-label="Folders"></div>
    <div class="aui-file-manager__content" role="group" aria-label="Contracts">
      <div class="aui-file-manager__columns"><button>Name</button><button>Size</button>...</div>
      <div class="aui-file-manager__viewport" role="listbox" aria-multiselectable="true" aria-label="Contracts" aria-activedescendant="...">
        <div class="aui-file-manager__canvas" role="none">
          <div class="aui-file-manager__row">
            <div class="aui-file-manager__item" role="option" aria-selected="false">icon, name, size, modified, type</div>
          </div>
        </div>
      </div>
      <div class="aui-file-manager__state"></div>                                (loading, empty, error)
      <ul class="aui-file-manager__uploads"><li>progress bar + Cancel</li></ul>
    </div>
  </div>
  <div class="aui-file-manager__status" role="status">12 items, 3 selected</div>
</div>
```

## 3. When to use

- Employee documents, contracts, or attachments that people upload, organize, and preview.
- A document library or shared drive in a business application, backed by your API or storage service.
- Picking or managing files inside a folder hierarchy rather than a flat list.

## 4. When not to use

- Selecting files to send with a form: use File Upload.
- A flat list of uploads with progress: use Upload Queue.
- A hierarchy that is not files and folders: use Tree View.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `options` | `Readonly<FileManagerOptions>` | Current options. |
| `currentFolderId` | `string \| null` | The folder shown. |
| `path` | `FileManagerPathItem[]` | The path from the root to the current folder. |
| `selected` | `string[]` | Ids of the selected entries. |
| `entries` | `readonly FileEntry[]` | Entries of the current folder in display order. |
| `view` | `FileManagerView` | The current view. |
| `loading` | `boolean` | A folder listing is in progress. |

Options (`FileManagerOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the region. |
| `provider` | `FileManagerProvider` | - (required) | No | The async storage (section 32). |
| `root` | `FileManagerRoot` | `{ id: null, label }` | No | The top folder `{ id, label }`. |
| `readOnly` | `boolean` | `false` | No | No create, rename, move, delete, or upload. |
| `accept` | `readonly string[]` | any | No | Accepted uploads: MIME types (`image/*`) and extensions (`.csv`). |
| `maxFileSize` | `number` | - | No | Largest accepted upload in bytes. |
| `preview` | `'auto' \| false \| FileManagerPreview` | `'auto'` | No | Preview of opened files. |
| `height` | `string \| null` | `'32rem'` | No | Block size as a CSS length, or `null` to fill the host. |
| `icons` | `Partial<FileManagerIcons>` | - | No | Entry and toolbar icons. |
| `view` | `'list' \| 'grid'` | `'list'` | Yes | List rows with columns, or tiles. |
| `sortBy` | `'name' \| 'size' \| 'modified' \| 'type'` | `'name'` | Yes | Sort key. |
| `sortDirection` | `'asc' \| 'desc'` | `'asc'` | Yes | Sort direction. |
| `foldersFirst` | `boolean` | `true` | Yes | Folders before files. |
| `showFolderPane` | `boolean` | `true` | Yes | Show the folder tree. |
| `locale` | `string` | common | Yes (common) | Locale of sizes, dates, sorting, and messages. |
| `timezone` | `string` | common | Yes (common) | Timezone of modified dates. |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | common | Yes (common) | Row and tile size. |

## 6. Methods

| Method | Description |
|---|---|
| `FileManager.create(host, options)` | Render into `host` (children are replaced) and list the root folder. |
| `navigate(folderId)` | Show a folder; a pending listing is aborted. |
| `refresh()` | List the current folder again. |
| `select(ids)` | Select entries of the current folder (no event). |
| `upload(files)` | Upload files to the current folder, checked against `accept` and `maxFileSize`. |
| `update(options)` | Merge and apply options; a new `provider` or `root` clears the cache and lists the root. |
| `destroy()` | Abort every provider call; remove rendering, dialogs, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-navigate` | `{ folderId, path }` | Another folder is shown. |
| `aui-change` | `{ selected }` | The user changed the selection. |
| `aui-open` | `{ entry }` (cancelable) | A file was opened; `preventDefault()` suppresses the built-in preview. |
| `aui-create-folder` | `{ entry }` | A folder was created. |
| `aui-rename` | `{ entry, previousName }` | An entry was renamed. |
| `aui-move` | `{ entries, targetFolderId, source }` | Entries were moved by drag (`'drag'`) or cut and paste (`'paste'`). |
| `aui-delete` | `{ entries }` | Entries were deleted. |
| `aui-upload` | `{ entry, file }` | One file finished uploading. |
| `aui-error` | `{ operation, error, entries }` | A provider call failed (`list`, `create-folder`, `rename`, `move`, `delete`, `upload`, `preview`). |

## 8. Slots/content areas

`preview`: a function returning a Node, shown in a dialog titled with the file name.

## 9. CSS parts/hooks

`aui-file-manager`, `aui-file-manager--list`, `aui-file-manager--grid`, `aui-file-manager--fill`, `aui-file-manager--no-pane`, `aui-file-manager--readonly`, `aui-file-manager__toolbar`, `aui-file-manager__tools`, `aui-file-manager__path`, `aui-file-manager__message`, `aui-file-manager__body`, `aui-file-manager__folders`, `aui-file-manager__content`, `aui-file-manager__columns`, `aui-file-manager__viewport`, `aui-file-manager__row`, `aui-file-manager__item` (`--folder`, `--file`, `--selected`, `--active`, `--cut`), `aui-file-manager__drop-target`, `aui-file-manager__state`, `aui-file-manager__uploads`, `aui-file-manager__status`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/file-manager/tokens.json` (verified in CI). Component tokens: `--aui-file-manager-border-color` (`color-border`), `--aui-file-manager-drop-bg` (`color-info-subtle`), `--aui-file-manager-drop-border` (`color-focus-ring`), and `--aui-file-manager-tile-radius` (`radius-md`). Selection uses `color-selected`, `color-selected-text`, and `color-selected-indicator`. The composed components keep their own tokens.

## 11. States

Loading, ready, empty folder, load error; list and grid views; with a selection; cut entries (dimmed); drag over a folder or the pane; uploading, upload error; operation error message; read-only; without the folder pane.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | open a folder, path link, tree folder, `navigate()` | loading, then ready, empty, or error (`aui-navigate`) |
| error | Try again, `refresh()` | loading |
| ready | click, arrows, Space, Ctrl+A | new selection (`aui-change`) |
| ready | New folder, F2, Delete, paste, drop, upload | provider call, then the view updates (or an error message and `aui-error`) |
| ready | Enter or double click on a file | `aui-open`, then the preview unless canceled |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowUp / ArrowDown | Content | Previous or next entry (row above or below in the grid); selects it. |
| ArrowLeft / ArrowRight | Content, grid | Previous or next tile in reading order. |
| Home / End / PageUp / PageDown | Content | First, last, or one page. |
| Shift+Arrow / Shift+Space / Shift+click | Content | Extend the selection from the anchor. |
| Ctrl+Arrow, Ctrl+Space / Ctrl+click | Content | Move without selecting, toggle an entry. |
| Ctrl+A | Content | Select all. |
| Enter / double click | Content | Open (folders are shown, files previewed). |
| Backspace / Alt+ArrowUp | Content | Parent folder. |
| F2 | Content | Rename. |
| Delete | Content | Delete after confirmation. |
| Ctrl+X / Ctrl+V | Content | Cut; paste into the current folder. |
| Ctrl+Shift+N | Content | New folder. |
| Shift+F10 / ContextMenu | Content | Actions for the selection. |
| Escape | Content | Cancel a cut, then clear the selection. |
| Characters | Content | Type-ahead by name. |
| ArrowLeft / ArrowRight / Home / End | Toolbar | Move between enabled buttons. |

On macOS, Cmd works wherever Ctrl is listed.

## 14. ARIA contract

- The host is a `region` labelled by `label`; the toolbar is a `toolbar`; the path is a Breadcrumb `nav`; the folder pane is a `tree`.
- The content is a `listbox` with `aria-multiselectable="true"`, labelled by the folder name, `aria-busy` while loading, and `aria-activedescendant` pointing at the active `option`.
- Options carry `aria-selected`, `aria-posinset`, and `aria-setsize` (they are virtualized).
- View buttons use `aria-pressed`; column buttons are named "Name, sorted ascending".
- The status bar is a `status`; delete confirmation is an `alertdialog`; name prompts and previews are dialogs.

## 15. Accessibility notes

- Every drag-and-drop move has a keyboard and context menu alternative (2.5.7 Dragging Movements).
- Results are announced (folder opened with its item count, created, renamed, moved, deleted, uploaded); errors appear as text and are announced assertively.
- Focus stays on the listbox while the active entry moves, so virtualization never loses focus; dialogs restore focus to the list.
- Selection is shown by a bar (list) or ring (grid) besides the fill.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

The toolbar wraps; the folder pane is a collapsible Splitter pane (or hidden with `showFolderPane: false`); the grid fits as many tiles per row as the width allows and recomputes on resize; list columns shrink and truncate.

## 17. RTL behavior

Toolbar, path, panes, columns, and tiles follow the writing direction. In the grid ArrowLeft and ArrowRight follow the reading order; toolbar arrows are mirrored.

## 18. Theme behavior

Names, columns, selection, drop target, and focus pairs are in the contrast gate in every theme. Forced colors draw the selection in `Highlight` and `HighlightText` and drop targets with a `Highlight` outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { fileManager: { view: 'grid', sortBy: 'modified', sortDirection: 'desc' } } });
```

## 20. Component configuration support

Instance options override configuration; the toolbar's view, sort, and folders-first choices update the instance options.

## 21. Timezone behavior

Modified dates (Instants from the provider) are formatted in the configured `timezone` with the configured `locale`.

## 22. Icon customization points

`icons`: `folder`, `folderOpen`, `file`, `image`, `code`, `text` (entries and tree), and `up`, `newFolder`, `upload`, `rename`, `delete`, `cut`, `paste`, `sort`, `list`, `grid`, `refresh` (toolbar and menus). Defaults come from `@absoluteui/icons/set`.

## 23. Security behavior

Names and every provider string are set as text. New names are validated: not empty, no `/` or `\`, not `.` or `..`, no control characters, at most 255 characters, unique in the folder. Provider entries are validated (an invalid listing is a load error with code `FILE_MANAGER_PROVIDER`). Image previews use the Image Viewer URL policy (https:, blob:, raster data:, same origin). `accept` and `maxFileSize` are checked in the browser only; the server must check uploads again.

## 24. Data handling behavior

No persistence, network access, or telemetry of its own: all data goes through the provider. Listings are cached per folder in memory until `refresh()` or a new provider or root.

## 25. Performance characteristics

The content is virtualized on the shared windowing engine: about 30 options are in the DOM whatever the folder size. A selection change updates the attributes of the rendered options only. Folders of the tree load when expanded.

## 26. Supported data scale

10,000 entries per folder in both views; folder trees of a few thousand folders, loaded lazily.

## 27. Usage examples

```ts
import { FileManager, type FileManagerProvider } from '@absoluteui/components/file-manager';

declare const provider: FileManagerProvider;
const host = document.querySelector<HTMLElement>('#documents');
if (host) {
  const files = FileManager.create(host, { label: 'Employee documents', provider, root: { id: 'emp-42', label: 'Ada Lovelace' }, accept: ['image/*', '.pdf', '.txt'] });
  host.addEventListener('aui-upload', () => {
    void files.refresh();
  });
}
```

More examples, type-checked in CI: `metadata/file-manager/examples.json`.

## 28. Edge cases

- Navigating while a folder loads aborts the earlier listing; a late answer is ignored.
- Moving a folder into itself or one of its sub-folders is refused before the provider is called.
- Names that differ only in case count as duplicates.
- Pasting cut entries into the folder they are already in is unavailable.
- An empty folder replaces the listbox with an empty state (an empty listbox is not allowed); focus moves to its first action.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `FILE_MANAGER_OPTIONS` | configuration | Blank label, a provider without the required functions, an invalid root, `accept`, `maxFileSize`, `preview`, or `height`. |
| `FILE_MANAGER_PROVIDER` | runtime | The provider returned invalid entries (reported through `aui-error`, never thrown). |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact. Provider failures never throw: they show an error state or message and emit `aui-error`.

## 30. Known limitations

- No copy operation (the provider contract has no copy).
- Folders dropped from the operating system are not expanded; only files upload.
- `navigate()` knows the full path only of folders listed before.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Inline name editing in the list (rename uses a dialog).
- Built-in preview of PDF, office, audio, or video files: pass a `preview` function.

## 32. TypeScript definitions

```ts
interface FileEntry { readonly id: string; readonly name: string; readonly kind: 'folder' | 'file'; readonly size?: number; readonly modified?: Instant; readonly mimeType?: string; readonly parentId: string | null; readonly hasChildren?: boolean; readonly readOnly?: boolean }
interface FileManagerRequest { readonly signal: AbortSignal }
interface FileManagerUploadRequest extends FileManagerRequest { readonly onProgress: (loaded: number, total: number) => void }
interface FileManagerProvider {
  list(folderId: string | null, request: FileManagerRequest): Promise<readonly FileEntry[]>;
  createFolder(parentId: string | null, name: string, request: FileManagerRequest): Promise<FileEntry>;
  rename(entry: FileEntry, name: string, request: FileManagerRequest): Promise<FileEntry>;
  move(entries: readonly FileEntry[], targetFolderId: string | null, request: FileManagerRequest): Promise<readonly FileEntry[]>;
  delete(entries: readonly FileEntry[], request: FileManagerRequest): Promise<void>;
  upload(folderId: string | null, file: File, request: FileManagerUploadRequest): Promise<FileEntry>;
  getUrl?(entry: FileEntry, request: FileManagerRequest): Promise<string>;
  read?(entry: FileEntry, request: FileManagerRequest): Promise<string>;
}
type FileManagerPreview = (entry: FileEntry, context: { readonly signal: AbortSignal; readonly provider: FileManagerProvider }) => Node | null | Promise<Node | null>;
interface FileManagerConfig { view: 'list' | 'grid'; sortBy: 'name' | 'size' | 'modified' | 'type'; sortDirection: 'asc' | 'desc'; foldersFirst: boolean; showFolderPane: boolean }
interface FileManagerOptions extends Partial<FileManagerConfig> {
  label: string;
  provider: FileManagerProvider;
  root?: { id: string | null; label: string };
  readOnly?: boolean;
  accept?: readonly string[];
  maxFileSize?: number;
  preview?: 'auto' | false | FileManagerPreview;
  height?: string | null;
  locale?: string;
  timezone?: string;
  density?: Density;
  icons?: Partial<FileManagerIcons>;
}
interface FileManagerNavigateDetail { folderId: string | null; path: { id: string | null; label: string }[] }
interface FileManagerChangeDetail { selected: string[] }
interface FileManagerOpenDetail { entry: FileEntry }
interface FileManagerRenameDetail { entry: FileEntry; previousName: string }
interface FileManagerMoveDetail { entries: FileEntry[]; targetFolderId: string | null; source: 'drag' | 'paste' }
interface FileManagerErrorDetail { operation: FileManagerOperation; error: unknown; entries: FileEntry[] }
```

## 33. Vanilla JS example

```ts
import { FileManager, type FileManagerProvider } from '@absoluteui/components/file-manager';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/breadcrumb/style.css';
import '@absoluteui/components/tree-view/style.css';
import '@absoluteui/components/splitter/style.css';
import '@absoluteui/components/menu/style.css';
import '@absoluteui/components/context-menu/style.css';
import '@absoluteui/components/dialog/style.css';
import '@absoluteui/components/text-input/style.css';
import '@absoluteui/components/empty-state/style.css';
import '@absoluteui/components/spinner/style.css';
import '@absoluteui/components/inline-message/style.css';
import '@absoluteui/components/progress-bar/style.css';
import '@absoluteui/components/image-viewer/style.css';
import '@absoluteui/components/code-viewer/style.css';
import '@absoluteui/components/file-manager/style.css';

declare const provider: FileManagerProvider;
const host = document.querySelector<HTMLElement>('#files');
if (host) FileManager.create(host, { label: 'Shared drive', provider });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { FileEntry, FileManagerOpenDetail, FileManagerProvider } from '@absoluteui/components/file-manager';
import { AuiFileManager } from '@absoluteui/angular/file-manager';

// An in-memory provider; a real one calls your API and passes request.signal to fetch.
const entries: FileEntry[] = [
  { id: 'contracts', name: 'Contracts', kind: 'folder', parentId: null },
  { id: 'offer', name: 'Offer letter.txt', kind: 'file', size: 2048, mimeType: 'text/plain', parentId: 'contracts' },
  { id: 'handbook', name: 'Handbook.txt', kind: 'file', size: 4096, mimeType: 'text/plain', parentId: null },
];
let next = 1;
const documentsProvider: FileManagerProvider = {
  list: async (folderId) => entries.filter((e) => e.parentId === folderId),
  createFolder: async (parentId, name) => {
    const entry: FileEntry = { id: `folder-${String(next++)}`, name, kind: 'folder', parentId };
    entries.push(entry);
    return entry;
  },
  rename: async (entry, name) => ({ ...entry, name }),
  move: async (moved, targetFolderId) => moved.map((e) => ({ ...e, parentId: targetFolderId })),
  delete: async () => {},
  upload: async (folderId, file, request) => {
    request.onProgress(file.size, file.size);
    return { id: `file-${String(next++)}`, name: file.name, kind: 'file', size: file.size, mimeType: file.type, parentId: folderId };
  },
};

@Component({
  selector: 'app-documents',
  imports: [AuiFileManager],
  template: `<aui-file-manager label="Employee documents" [provider]="provider" view="grid" (opened)="onOpen($event)"></aui-file-manager>`,
})
export class DocumentsComponent {
  readonly provider = documentsProvider;
  lastOpened = '';
  onOpen(detail: FileManagerOpenDetail): void {
    this.lastOpened = detail.entry.name;
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
