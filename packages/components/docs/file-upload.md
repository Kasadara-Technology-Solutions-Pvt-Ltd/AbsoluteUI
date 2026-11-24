# File Upload

> Package: `@absoluteui/components/file-upload` | Styles: `@absoluteui/components/file-upload/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

A file picker for forms. It provides:
- a native `<input type="file">` opened by a real `<button>` (keyboard and screen-reader path);
- an optional drag-and-drop zone around the button (an enhancement, never the only way in);
- validation of MIME type and extension (both, when both are configured), per-file size, total size, and file count. The `accept` attribute is only a hint: every file is re-checked;
- rejected files are not added; the reason is shown next to the field and announced;
- a list of selected files with remove buttons;
- the `FormControl` contract: `Form` validates, serializes (`File[]`), resets, and focuses it.

It never reads file contents and never performs network requests. To transfer files with progress, feed an [Upload Queue](upload-queue.md).

## 2. Anatomy

```text
<div class="aui-field aui-file-upload [--dragover] [--invalid] [--disabled] [--no-zone]">
  <label class="aui-field__label" for="B" id="L">Attachments<span aria-hidden="true">*</span></label>
  <div class="aui-field__description" id="D">help text</div>
  <div class="aui-file-upload__zone">                       (drop target)
    <span class="aui-file-upload__zone-icon"><svg aria-hidden="true"/></span>
    <span class="aui-file-upload__prompt">Drag files here or</span>
    <button type="button" id="B" class="aui-file-upload__button" aria-labelledby="L T" aria-describedby="D H R E X">
      <span id="T">Choose files</span>
    </button>
    <div class="aui-file-upload__hint" id="H">Allowed file types: .pdf. Maximum 5 MB per file.</div>
    <span class="aui-visually-hidden" id="R">Required</span>
    <input type="file" hidden tabindex="-1" name="attachments" multiple accept=".pdf">
  </div>
  <div class="aui-field__error" id="E">...</div>
  <div class="aui-file-upload__rejections" id="X"><ul><li>report.exe: This file type is not allowed.</li></ul></div>
  <ul class="aui-file-upload__list" aria-label="Selected files">
    <li class="aui-file-upload__item [--invalid]">
      <svg aria-hidden="true"/>
      <span class="aui-file-upload__file"><span class="__name">a.pdf</span><span class="__size">1.2 MB</span><span class="__issue"></span></span>
      <button class="aui-file-upload__remove" aria-label="Remove a.pdf"><svg aria-hidden="true"/></button>
    </li>
  </ul>
</div>
```

## 3. When to use

- Attaching one or more files to a form.
- Feeding an Upload Queue that uploads files as soon as they are chosen.
- Any file selection that needs consistent, localized validation messages.

## 4. When not to use

- Folder trees or very large batches (thousands of files).
- In-page camera or media capture.
- As a security control: client-side checks can be bypassed; validate type and size on the server.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `input` | `HTMLInputElement` | Native file input (hidden, not a tab stop). |
| `button` | `HTMLButtonElement` | Chooser button. |
| `value` | `readonly File[]` | Selected files, in selection order. |
| `validity` | `FileUploadValidity` | `{ valid, error, message }`. |
| `rejections` | `readonly FileRejection[]` | Files not added by the last selection. |
| `name`, `label`, `disabled`, `dirty`, `touched` | | Form-control contract. |
| `options` | `Readonly<FileUploadOptions>` | Current options. |

Options (`FileUploadOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label; part of the button name. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `name` | `string` | - | No | Field name (also on the native input). |
| `multiple` | `boolean` | `false` | No | Allow several files; selections append. |
| `value` | `readonly File[]` | `[]` | No | Initial files; `reset()` restores them. |
| `required` | `boolean` | `false` | No | At least one file. |
| `disabled` | `boolean` | `false` | No | Disables button, drop zone, remove buttons. |
| `acceptTypes` | `readonly string[]` | - | No | MIME types, `type/subtype` or `type/*`. |
| `acceptExtensions` | `readonly string[]` | - | No | Extensions with the dot. With `acceptTypes`, a file must match both. |
| `maxFileSize` | `number` (bytes) | - | No | Per-file limit. |
| `maxTotalSize` | `number` (bytes) | - | No | Combined limit. |
| `maxFiles` | `number` | - | No | Count limit (requires `multiple`). |
| `buttonText` | `string` | "Choose file(s)" | No | Button text. |
| `validate` | `(files) => string \| null` | - | No | Consumer validation. |
| `icons` | `Partial<FileUploadIcons>` | - | No | Icon overrides. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages first appear. |
| `dropZone` | `boolean` | `true` | Yes | Render the drop zone. |
| `showConstraints` | `boolean` | `true` | Yes | Render the limits hint. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and size formatting. |

## 6. Methods

| Method | Description |
|---|---|
| `FileUpload.create(host, options)` | Render into `host` (children are replaced). |
| `getFormValue()` | A copy of the files (`File[]`). |
| `setValue(files)` | Replace the selection (no events, no filtering: violations make the value invalid). |
| `removeFile(file)` | Remove one file (no events). |
| `openPicker()` | Open the native chooser (needs user activation). |
| `update(options)` | Merge and apply options; invalid options throw and leave the state unchanged. |
| `reportValidity()`, `setCustomError(message)`, `focus()`, `reset()` | Form-control contract. |
| `destroy()` | Remove rendering, registration, listeners, and the configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-change` | `{ files, added, removed, validity }` | Yes | The user added files (chooser or drop) or removed one. |
| `aui-reject` | `{ rejected: { file, reason, message }[] }` | Yes | A selection contained files that were not added. `reason`: `file-type`, `file-too-large`, `total-too-large`, `too-many-files`, `folder`. |

Programmatic changes (`setValue`, `update`, `reset`) emit nothing.

## 8. Slots/content areas

None. Label, help text, and button text are text options.

## 9. CSS parts/hooks

`aui-file-upload`, `--dragover`, `--invalid`, `--disabled`, `--no-zone`, `__zone`, `__zone-icon`, `__prompt`, `__button`, `__hint`, `__rejections`, `__rejection-list`, `__list`, `__item` (`--invalid`), `__file-icon`, `__file`, `__name`, `__size`, `__issue`, `__remove`, plus the shared `aui-field__*` chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/file-upload/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-border-strong` (dashed zone), `color-selected` / `color-selected-text` (drag-over), `color-error-fg`, `touch-target-min`, `border-width-strong`.

## 11. States

empty, files selected, dragging over, files rejected, required, invalid, disabled.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty / selected | chooser or drop with valid files | selected (appended in multiple mode, replaced in single mode); `aui-change` |
| any | selection with rule-breaking files | those files are not added; rejections shown and announced; `aui-reject` |
| selected | remove button | file removed, focus to next remove button / previous / chooser; announced; `aui-change` |
| idle | files dragged over the zone | `--dragover` until they leave or drop |
| any | `update()` with stricter rules | existing files re-validated; value may become invalid (per-row reasons shown) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Chooser button, then each remove button. |
| Enter / Space | Chooser | Opens the native file chooser. |
| Enter / Space | Remove button | Removes the file; focus moves to the next remove button, else the previous one, else the chooser. |

## 14. ARIA contract

- The chooser is a native button named by `aria-labelledby` = label + button text ("Attachments Choose files").
- `aria-describedby` on the button: help text, constraint hint, "Required" (visually hidden, because a button cannot carry `aria-required`), the visible error, and the rejections.
- Selected files are a `<ul aria-label="Selected files">`; each remove button is named "Remove {file}".
- The native input is `hidden` and `tabindex="-1"`: it is opened by the button, so there is one tab stop.

## 15. Accessibility notes

- Dragging is never required (WCAG 2.5.7): the button is the primary path; after a drop, focus moves to it.
- Rejections are announced politely ("report.exe was not added. This file type is not allowed." or "3 files were not added."), removals too ("a.pdf removed").
- Errors use text and an icon, never color alone. Remove buttons have a 24 px target (2.5.8).
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Full width of its container. The drop zone content wraps and centers; file rows wrap size and reason under the name; it reflows at 320 CSS px.

## 17. RTL behavior

Logical properties throughout; icons and remove buttons follow the inline direction. File names render as text in their own direction.

## 18. Theme behavior

Dashed `color-border-strong` zone on `color-surface`; drag-over switches to `color-selected` with `color-selected-text`; errors use `color-error-fg`. Forced-colors mode draws `CanvasText` borders and a `Highlight` drag-over border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { fileUpload: { dropZone: false, showConstraints: true, validationTiming: 'submit' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.upload` (default `upload`), `icons.file` (`file`), `icons.remove` (`close`), `icons.error` (`alert-circle`).

## 23. Security behavior

- File names, reasons, and messages are rendered with `textContent` (never HTML).
- The browser's MIME type is usually derived from the file name and is not proof of content. Configure both `acceptTypes` and `acceptExtensions` for defense in depth, and always validate type (for example by magic bytes) and size on the server.
- The `accept` attribute only filters the OS dialog; drops and "All files" choices are re-checked.
- No file contents are read. CSP-safe (no inline styles or HTML sinks).

## 24. Data handling behavior

Files stay in memory as `File` objects and in the native input. Nothing is persisted, logged, or transmitted.

Serialization:
- `getFormValue()` and `Form.getValues()` return `File[]` under the field name (always an array, also in single mode; `[]` when empty). `File` objects are not JSON-serializable: append them to a `FormData` to send them:

```ts
const data = new FormData();
for (const file of values.attachments as File[]) data.append('attachments', file);
```

- The native input is kept in sync (through `DataTransfer`), so `new FormData(formElement)` and native form submission (`submitMode: 'native'`, `enctype="multipart/form-data"`) include exactly the selected files, including dropped ones.

## 25. Performance characteristics

File rows are rebuilt only when the selection changes; validation passes update text only. Budgets: `FileUpload.create` < 1 ms per instance; selecting 200 files (validate and render) < 100 ms (headless Chromium, e2e performance suite).

## 26. Supported data scale

Tested with 200 files in one selection. For thousands of files, use a dedicated tool.

## 27. Usage examples

```ts
import { FileUpload } from '@absoluteui/components/file-upload';

const host = document.createElement('div');
document.body.append(host);
FileUpload.create(host, { label: 'Attachments', name: 'attachments', multiple: true, acceptExtensions: ['.pdf'], maxFileSize: 5_000_000 });
```

More examples, type-checked in CI: `metadata/file-upload/examples.json`.

## 28. Edge cases

- The same file (name, size, modification time) selected twice is ignored.
- Single mode: a new file replaces the current one; if it is rejected, the current file is kept. Extra dropped files are rejected ("You can select only 1 file.").
- Count and total limits reject files in selection order; later smaller files can still fit.
- Dropped folders are rejected ("Folders cannot be added.").
- A cancelled OS dialog changes nothing.
- Sizes use decimal units: `maxFileSize: 5_000_000` reads "5 MB".

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `FILE_UPLOAD_OPTIONS` | configuration | Missing label, malformed `acceptTypes`/`acceptExtensions`, non-positive sizes, `maxFiles` without `multiple`, non-File `value`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Validity error codes: `value-missing`, `file-type`, `file-too-large`, `too-many-files`, `total-too-large`, `custom`. A failed construction leaves the host untouched.

## 30. Known limitations

- Decimal size units only.
- The drag-over highlight depends on the browser exposing `Files` during `dragenter`.
- Browsers without a `DataTransfer` constructor cannot sync the native input; `getFormValue()` stays authoritative.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Reading, previewing, or transforming file contents (Upload Queue offers image previews).
- Folder upload (`webkitdirectory`), paste-to-upload.
- HTML in labels, hints, or file names.

## 32. TypeScript definitions

```ts
type FileUploadErrorCode = 'value-missing' | 'file-too-large' | 'file-type' | 'too-many-files' | 'total-too-large' | 'custom';
type FileRejectionReason = 'file-too-large' | 'file-type' | 'too-many-files' | 'total-too-large' | 'folder';
interface FileUploadValidity { readonly valid: boolean; readonly error: FileUploadErrorCode | null; readonly message: string }
interface FileRejection { readonly file: File; readonly reason: FileRejectionReason; readonly message: string }
interface FileUploadConfig { validationTiming: ValidationTiming; dropZone: boolean; showConstraints: boolean }
interface FileUploadOptions extends Partial<FileUploadConfig> {
  label: string; hideLabel?: boolean; description?: string; name?: string; multiple?: boolean;
  value?: readonly File[]; required?: boolean; disabled?: boolean;
  acceptTypes?: readonly string[]; acceptExtensions?: readonly string[];
  maxFileSize?: number; maxTotalSize?: number; maxFiles?: number; buttonText?: string;
  validate?: (files: readonly File[]) => string | null; locale?: string; icons?: Partial<FileUploadIcons>;
}
interface FileUploadChangeDetail { files: readonly File[]; added: readonly File[]; removed: readonly File[]; validity: FileUploadValidity }
interface FileUploadRejectDetail { rejected: readonly FileRejection[] }
```

## 33. Vanilla JS example

```ts
import { FileUpload, type FileUploadRejectDetail } from '@absoluteui/components/file-upload';
import '@absoluteui/components/file-upload/style.css';

const host = document.querySelector<HTMLElement>('#photos');
if (host) {
  const upload = FileUpload.create(host, { label: 'Photos', multiple: true, acceptTypes: ['image/*'], maxTotalSize: 20_000_000 });
  upload.host.addEventListener('aui-reject', (e) => {
    console.info(`${String((e as CustomEvent<FileUploadRejectDetail>).detail.rejected.length)} files rejected`);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuiFileUpload } from '@absoluteui/angular/file-upload';

@Component({
  selector: 'app-attachments',
  imports: [ReactiveFormsModule, AuiFileUpload],
  template: `<aui-file-upload label="Attachments" [multiple]="true" [acceptExtensions]="['.pdf']" [formControl]="files"></aui-file-upload>`,
})
export class AttachmentsComponent {
  readonly files = new FormControl<File[]>([], { nonNullable: true });
}
```

The model is `File[]`; the Validator reports the component's validity under the `aui` key.

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
