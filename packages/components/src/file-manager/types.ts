/**
 * File Manager data contract (R20 P10): the entries, the host-supplied async provider, and
 * the event details. Every provider call receives an AbortSignal; the File Manager aborts
 * a pending folder listing when the user navigates away, an upload when the user cancels
 * it, and everything when it is destroyed.
 */
import type { Instant } from '@absoluteui/core';

/** A file or folder as the provider reports it. */
export interface FileEntry {
  /** Unique, stable id across the whole tree. */
  readonly id: string;
  /** Display name (rendered as text). */
  readonly name: string;
  readonly kind: 'folder' | 'file';
  /** Size in bytes (files). */
  readonly size?: number;
  /** Last modification. */
  readonly modified?: Instant;
  /** MIME type (files), such as `image/png`; used for the type column and the built-in preview. */
  readonly mimeType?: string;
  /** Id of the containing folder; null for entries in the root folder whose id is null. */
  readonly parentId: string | null;
  /** Folders: false when the folder has no sub-folders (the folder tree shows no twisty). */
  readonly hasChildren?: boolean;
  /** Cannot be renamed, moved, or deleted. */
  readonly readOnly?: boolean;
}

/** Context of every provider call. */
export interface FileManagerRequest {
  readonly signal: AbortSignal;
}

/** Context of an upload: report progress with `onProgress(loaded, total)` in bytes. */
export interface FileManagerUploadRequest extends FileManagerRequest {
  readonly onProgress: (loaded: number, total: number) => void;
}

/**
 * The storage behind the File Manager (a REST API, a cloud drive, IndexedDB, or memory).
 * Reject (throw) to report an error; the File Manager shows it and emits `aui-error`.
 */
export interface FileManagerProvider {
  /** The direct children (files and folders) of a folder; `null` is the root folder when `root.id` is null. */
  list(folderId: string | null, request: FileManagerRequest): Promise<readonly FileEntry[]>;
  createFolder(parentId: string | null, name: string, request: FileManagerRequest): Promise<FileEntry>;
  rename(entry: FileEntry, name: string, request: FileManagerRequest): Promise<FileEntry>;
  /** Move entries into a folder; resolve with the moved entries (new `parentId`). */
  move(entries: readonly FileEntry[], targetFolderId: string | null, request: FileManagerRequest): Promise<readonly FileEntry[]>;
  delete(entries: readonly FileEntry[], request: FileManagerRequest): Promise<void>;
  upload(folderId: string | null, file: File, request: FileManagerUploadRequest): Promise<FileEntry>;
  /** A URL of a file's content (https:, blob:, a raster data: URL, or same-origin) for the image preview. */
  getUrl?(entry: FileEntry, request: FileManagerRequest): Promise<string>;
  /** A text file's content for the text and code preview. */
  read?(entry: FileEntry, request: FileManagerRequest): Promise<string>;
}

/** One step of the current path (the root first). */
export interface FileManagerPathItem {
  readonly id: string | null;
  readonly label: string;
}

/** Context of a custom preview. */
export interface FileManagerPreviewContext {
  readonly signal: AbortSignal;
  readonly provider: FileManagerProvider;
}

/** A custom preview: content for a dialog titled with the file name, or null for no preview. */
export type FileManagerPreview = (entry: FileEntry, context: FileManagerPreviewContext) => Node | null | Promise<Node | null>;

export type FileManagerOperation = 'list' | 'create-folder' | 'rename' | 'move' | 'delete' | 'upload' | 'preview';

/** `aui-navigate` detail: the folder now shown. */
export interface FileManagerNavigateDetail {
  folderId: string | null;
  path: FileManagerPathItem[];
}

/** `aui-change` detail: the selected entry ids after the user's change. */
export interface FileManagerChangeDetail {
  selected: string[];
}

/** `aui-open` detail (cancelable: `preventDefault()` suppresses the built-in preview). */
export interface FileManagerOpenDetail {
  entry: FileEntry;
}

/** `aui-rename` detail. */
export interface FileManagerRenameDetail {
  entry: FileEntry;
  previousName: string;
}

/** `aui-create-folder` detail. */
export interface FileManagerCreateFolderDetail {
  entry: FileEntry;
}

/** `aui-move` detail. */
export interface FileManagerMoveDetail {
  entries: FileEntry[];
  targetFolderId: string | null;
  source: 'drag' | 'paste';
}

/** `aui-delete` detail. */
export interface FileManagerDeleteDetail {
  entries: FileEntry[];
}

/** `aui-upload` detail: one file finished uploading. */
export interface FileManagerUploadDetail {
  entry: FileEntry;
  file: File;
}

/** `aui-error` detail. */
export interface FileManagerErrorDetail {
  operation: FileManagerOperation;
  error: unknown;
  entries: FileEntry[];
}
