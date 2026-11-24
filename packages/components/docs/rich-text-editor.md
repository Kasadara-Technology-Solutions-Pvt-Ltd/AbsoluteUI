# Rich Text Editor

> Package: `@absoluteui/components/rich-text-editor` | Styles: `@absoluteui/components/rich-text-editor/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

Formatted multi-line text entry. `RichTextEditor` renders a `contenteditable` textbox whose content is owned by an internal document model. Every edit arrives as an Input Events `beforeinput` (or a key command), is cancelled, applied to the model, and the affected blocks are re-rendered; the browser's editing engine never changes the DOM, except during IME composition, which is reconciled from the DOM at `compositionend`. `document.execCommand` is not used.

Formatting set: bold, italic, underline, strikethrough, inline code, links, normal text, headings 1-3, bulleted and numbered lists (nested to depth 4), block quotes, code blocks, and alignment (start, center, end, justify). The editor also provides undo/redo, sanitized HTML and Markdown input and output, Markdown typing shortcuts, a plain-text mode, and the same form-control contract as Textarea: label, required indicator, help text, localized validation, and an optional character counter.

## 2. Anatomy

```text
<div class="aui-field aui-rte" data-aui-control>                        (consumer host)
  <label class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-rte__toolbar" role="toolbar" aria-label="Formatting" aria-controls=content>   (hidden in plain mode)
    <button class="aui-rte__tool" data-command="bold" aria-label="Bold" aria-pressed tabindex="0|-1">
    <div class="aui-rte__separator" role="separator" aria-orientation="vertical">
  <div class="aui-rte__link-panel" role="group" aria-label="Link" hidden>
    <label class="aui-rte__link-label" for=address>Link address</label>
    <div class="aui-rte__link-row">
      <input type="url" class="aui-rte__link-input">
      <button class="aui-rte__link-button aui-rte__link-apply|remove|cancel">
    <div class="aui-rte__link-error aui-validation-message" hidden>
  <div class="aui-rte__surface">                                        (border, scrolling, focus indicator)
    <div class="aui-rte__content" role="textbox" aria-multiline="true" aria-labelledby=label contenteditable>
      <p|h1-h3|blockquote|pre class="aui-rte__block" data-aui-block="0">...
      <ul|ol class="aui-rte__list"><li class="aui-rte__block">...
  <div class="aui-field__description">                                  (optional)
  <div class="aui-field__counter">                                      (showCounter)
  <div class="aui-field__error aui-validation-message">                 (when shown)
  <input type="hidden" name>                                            (value for native submission)
</div>
```

## 3. When to use

- Formatted content that users write themselves: release notes, descriptions, comments, knowledge-base text.
- Values stored as sanitized HTML or Markdown that must round-trip without unsafe markup.
- Multi-paragraph plain text with the same editing surface as the rich variant (`mode: 'plain'`).

## 4. When not to use

- Unformatted text without paragraph structure: use Textarea (native, lighter).
- Single-line values: use Text Input.
- Documents that need tables, images, colors, fonts, or embedded media: not supported.
- Code editing with syntax highlighting: code blocks are plain monospace text.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `content` | `HTMLDivElement` | The contenteditable textbox. Do not mutate its DOM. |
| `value` | `string` | Current value in `valueFormat` (`''` when empty in `html`/`markdown`). |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `formatState` | `RichTextEditorFormatState` | Formatting at the selection: `{ marks, block, align, link, canUndo, canRedo }`. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Content differs from the initial value. |
| `touched` | `boolean` | Focus has left the control at least once. |

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | (required) | Accessible name. |
| `hideLabel` | `boolean` | `false` | Visually hidden label. |
| `value` | `string` | `''` | Initial value in `valueFormat`; restored by `reset()`. |
| `valueFormat` | `'html' \| 'markdown' \| 'text'` | `'html'` (rich), `'text'` (plain) | Format of `value`, `getFormValue()`, and event details. |
| `mode` | `'rich' \| 'plain'` | `'rich'` | `plain`: no formatting and no toolbar. |
| `name`, `placeholder`, `description` | `string` | | |
| `required`, `disabled`, `readOnly` | `boolean` | `false` | |
| `minLength`, `maxLength` | `number` | | Plain-text length in code points. |
| `showCounter` | `boolean` | `false` | Requires `maxLength`. |
| `toolbar` | `readonly RichTextToolbarItem[]` | all items | `'\|'` is a separator. |
| `headings` | `readonly (1 \| 2 \| 3)[]` | `[1, 2, 3]` | Offered and accepted levels. |
| `linkSchemes` | `readonly string[]` | `['http', 'https', 'mailto', 'tel']` | Besides relative URLs. |
| `rows` | `number` | `6` | Minimum height in rows, 1..100. |
| `maxRows` | `number` | | Maximum height in rows (>= `rows`); content scrolls beyond it. |
| `spellcheck` | `boolean` | `true` | |
| `validate` | `(value: string) => string \| null` | | Receives the value in `valueFormat`. |
| `icons` | `Partial<{ error: IconRef }>` | | |

Full table: `metadata/rich-text-editor/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `markdownShortcuts` | `boolean` | `true` |
| `historyLimit` | integer 0..1000 | `100` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `RichTextEditor.create(host, options)` | Render into `host` (children are replaced). Options and the initial value are validated and parsed before the host is touched. |
| `getHTML()` / `setHTML(html)` | Sanitized HTML out / in. |
| `getMarkdown()` / `setMarkdown(markdown)` | Markdown out / in. |
| `getText()` / `setText(text)` | Plain text out / in (one paragraph per line). |
| `setValue(value)` | Replace the content from a value in `valueFormat`. |
| `command(item)` | Run a toolbar command (`'bold'`, `'heading2'`, `'bulletList'`, `'alignCenter'`, `'link'`, `'undo'`, ...) at the selection. No-op when disabled or read-only; formatting commands are no-ops in plain mode. |
| `undo()` / `redo()` | One history step; return `false` when there is nothing to undo/redo. |
| `insertText(text)` | Insert text at the selection with the current style, as a user edit. |
| `openLinkEditor()` | Open the link panel (like Mod+K). |
| `update(options)` | Merge and apply options (validated first). Passing `value` replaces the content. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error; cleared when the user edits. `null` or `''` clears it. |
| `getFormValue()` | Value for form serialization (same as `value`). |
| `focus()` | Focus the content and restore the last selection. |
| `reset()` | Restore the initial value; clear history and dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

`setValue`, `setHTML`, `setMarkdown`, `setText`, and `update({ value })` emit no events, clear the undo history, and clear an external custom error.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-input` | `RichTextEditorValueDetail` (`{ value, validity }`) | Yes | The user edited the content: typing, deletion, formatting, paste, drop, cut, undo, redo, `insertText`, `command`. |
| `aui-change` | `RichTextEditorValueDetail` (`{ value, validity }`) | Yes | Focus left the component and the content differs from when it was focused. Moving focus to the toolbar or link panel does not count. |

Neither event is cancelable. `value` in the detail uses `valueFormat`.

## 8. Slots/content areas

None. Label and help text are text options; the content is the editor value.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-rte` | Host. |
| `aui-rte--invalid`, `--disabled`, `--readonly`, `--plain`, `--empty` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__counter`, `__error` | Shared field chrome. |
| `aui-rte__toolbar`, `aui-rte__tool`, `aui-rte__tool--text`, `aui-rte__tool--active`, `aui-rte__separator` | Toolbar, tools (`data-command` = item), text tools (P, H1-H3), link tool while the caret is in a link, separators. |
| `aui-rte__link-panel`, `__link-label`, `__link-row`, `__link-input`, `__link-button`, `__link-apply`, `__link-remove`, `__link-cancel`, `__link-error` | Link editor. |
| `aui-rte__surface` | Bordered, scrolling container; the control boundary and focus indicator. |
| `aui-rte__content` | The contenteditable textbox. |
| `aui-rte__block`, `aui-rte__code`, `aui-rte__list`, `aui-rte__link` | Rendered blocks, code blocks, list containers, links. |
| `aui-rte__align-center`, `aui-rte__align-end`, `aui-rte__align-justify` | Alignment of rendered blocks (the HTML output uses `data-align`). |

Custom properties set on the surface: `--aui-rte-rows` and `--aui-rte-max-rows`. All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/rich-text-editor/tokens.json` (verified against the stylesheet in CI, including tokens used by the shared field-chrome, control-surface, text-control-states, and forced-colors mixins). Key tokens: `color-surface`, `color-surface-sunken`, `color-border-strong`, `color-focus-ring`, `color-selected`, `color-selected-text`, `color-hover`, `color-link`, `color-error-fg`, `font-family-mono`, `touch-target-min`, `space-3`, `radius-md`.

## 11. States

default, focus-visible, empty (placeholder), filled, disabled, read-only, required, invalid (message shown), over limit, plain mode, link panel open, toolbar tool pressed, toolbar tool disabled.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| pristine | user edits | dirty; `aui-input`; message shown only with `validationTiming: 'input'` |
| any | focus leaves the host | touched; `aui-change` if the content changed since focus; messages shown (`blur` timing) |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| editing | Mod+K or Link tool | link panel open, focus in the address field |
| link panel open | Apply / Enter with an allowed URL | link set (or the address inserted as linked text when nothing is selected); panel closed; focus back in the content |
| link panel open | Apply with a rejected URL | panel stays open; `aria-invalid` and the error message on the address |
| link panel open | Remove link | link removed from the range; panel closed |
| link panel open | Cancel / Escape | panel closed without changes |
| rich | `update({ mode: 'plain' })` | content converted to plain text; toolbar hidden |
| any | `reset()` | initial value; pristine, untouched; history cleared |

## 13. Keyboard matrix

Mod is Ctrl on Windows and Linux and Cmd on Apple platforms.

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Outside a list item | Moves focus between the toolbar (one tab stop), the content, and the page. |
| Tab / Shift+Tab | Selection entirely in list items | Indents / outdents the items (depth 0-4). |
| Escape, then Tab / Shift+Tab | Content | Leaves the editor instead of indenting (no keyboard trap). |
| Enter | Content | New paragraph or list item. At the end of a heading: a paragraph. Empty list item: outdent, then leave the list. Empty quote: leave it. Code block: a line break; on an empty last line: leave the block. |
| Shift+Enter | Content | Line break within the block. |
| Backspace | Start of a block | List item: outdent, then paragraph. Heading, quote, empty code block: paragraph. Otherwise merge with the previous block. |
| Backspace / Delete (and word/line variants such as Ctrl+Backspace) | Content | Deletes a grapheme cluster, word, or line through the model. Delete at the end of a block merges the next block. |
| Mod+B / Mod+I / Mod+U | Content | Bold / italic / underline on the selection, or for the next typed text when the selection is collapsed. |
| Mod+Shift+X / Mod+E | Content | Strikethrough / inline code. |
| Mod+K | Content | Open the link panel. |
| Mod+Shift+7 / Mod+Shift+8 | Content | Numbered / bulleted list (toggle). |
| Mod+Alt+0 / 1 / 2 / 3 | Content | Normal text / heading 1 / 2 / 3 (a heading toggles back to normal text). |
| Mod+Shift+L / E / R / J | Content | Align start / center / end / justify. |
| Mod+Z | Content | Undo. |
| Mod+Shift+Z / Mod+Y | Content | Redo. |
| Alt+F10 | Content (rich mode) | Focus the toolbar. |
| ArrowLeft / ArrowRight | Toolbar | Previous / next tool, wrapping (roving tabindex). |
| Home / End | Toolbar | First / last tool. |
| Enter / Space | Toolbar tool | Run the command; focus returns to the content (Link opens the link panel). |
| Escape | Toolbar | Back to the content. |
| Enter | Link address | Apply the link. |
| Escape | Link address | Close the panel; focus returns to the content. |

Markdown typing shortcuts (rich mode, `markdownShortcuts: true`):

| Typed | Result |
|---|---|
| `# `, `## `, `### ` at the start of a paragraph | Heading 1-3 (only levels in `headings`) |
| `- `, `* `, `+ ` at the start of a paragraph | Bulleted list item |
| `1. ` or `1) ` at the start of a paragraph | Numbered list item |
| `> ` at the start of a paragraph | Quote |
| ` ``` ` (optionally followed by a language word), then Enter | Code block |
| `**text**` or `__text__` | Bold |
| `*text*` or `_text_` | Italic |
| `~~text~~` | Strikethrough |
| `` `text` `` | Inline code |

Inline shortcuts apply when the closing delimiter is typed, not inside code blocks. Each conversion is its own undo step: Mod+Z restores the typed characters.

## 14. ARIA contract

- Content: `role="textbox"`, `aria-multiline="true"`, `aria-labelledby` (visible label), `aria-describedby` (help text, counter, visible error), `aria-invalid="true"` only while an error message is shown, `aria-required`, `aria-readonly`, `aria-disabled`, `aria-placeholder`.
- Toolbar: `role="toolbar"`, `aria-label` ("Formatting"), `aria-controls` = content id; one tool has `tabindex="0"`.
- Tools: native buttons with `aria-label` (and `title`); toggle tools (block types, marks, lists, quote, code block, alignment) carry `aria-pressed`; unavailable tools carry `aria-disabled="true"` and stay focusable.
- Separators: `role="separator"`, `aria-orientation="vertical"`.
- Link panel: `role="group"`, `aria-label` ("Link"); the address input has a `<label for>`; a rejected URL sets `aria-invalid` and `aria-describedby` to the error.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`; `aria-required` conveys the state.
- Errors appear after focus leaves the component by default, then update live.
- Toolbar mark toggles, block type changes, undo/redo, and link add/remove are announced through a polite live region.
- Pressed tools use selected colors plus a border, so state is not conveyed by color alone. Toolbar tools are at least `touch-target-min` in size.
- Focus returns to the content with its previous selection after toolbar commands and when the link panel closes. Mouse presses on tools keep the editor's selection.
- axe WCAG 2.2 AA passes in the default, dark, and high-contrast themes with the link panel open and the invalid state shown (e2e).
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Full width of its container. The toolbar wraps onto several lines; the editor reflows at 320 CSS px without horizontal scrolling (e2e). The content is at least `rows` rows high and scrolls beyond `maxRows`; row bounds use `lh` units so they follow density tokens.

## 17. RTL behavior

Logical properties throughout. The content element gets `dir="rtl"` when the resolved direction is `'rtl'` and `dir="auto"` otherwise. Alignment is stored as start/center/end/justify, so it follows the writing direction; `formatJustifyLeft`/`formatJustifyRight` input events map to end/start in RTL. Toolbar arrow keys follow DOM order and are not mirrored in RTL.

## 18. Theme behavior

Colors come from role tokens only (light, dark, and high-contrast themes). In forced-colors mode, pressed tools use `Highlight`/`HighlightText`, disabled tools `GrayText`, the surface border `CanvasText`, focus a `Highlight` outline, and links `LinkText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { richTextEditor: { validationTiming: 'input', markdownShortcuts: false, historyLimit: 50 } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options can be changed with `update()`. Changing `toolbar`, `mode`, `headings`, or `locale` rebuilds the toolbar.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`). Toolbar icons are fixed.

## 23. Security behavior

- No `innerHTML` and no `document.execCommand`: the view builds the DOM with `createElement` and text nodes from the model (SPEC section 14.5).
- HTML input (`value`, `setHTML`, paste, drop) is parsed only through the core sanitizer (inert parse, allowlist rebuild) and then mapped to the model, so only supported structure survives. Scripts, event handlers, `style` attributes, images, and unknown elements are dropped (text is kept where applicable).
- HTML output is generated from the model with escaping and contains only `p`, `h1`-`h3`, `blockquote`, `pre`/`code`, `ul`/`ol`/`li`, `strong`, `em`, `u`, `s`, `code`, `br`, and `a[href]`. Alignment is written as `data-align="center|end|justify"`; `style` attributes are never produced, so the output renders under a strict CSP.
- URL policy for links (link panel, HTML, Markdown, paste): relative URLs plus `linkSchemes` (default `http`, `https`, `mailto`, `tel`). `javascript`, `data`, and `vbscript` can never be allowed (`linkSchemes` containing them throws). Rejected links keep their text only; the link panel shows an error.
- Label, help text, messages, and toolbar labels are rendered with `textContent`. Validation messages never include the entered value.
- Sizing custom properties are set through the CSSOM. Tested under a strict CSP with Trusted Types while typing, pasting HTML, and linking (e2e).

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, a hidden input carries the value (in `valueFormat`) for native form submission, and Form reads it through `getFormValue()`. Copy and cut write `text/plain` and, in rich mode, `text/html` generated from the model.

## 25. Performance characteristics

Each edit produces a new immutable document; the view reuses the element of every unchanged block, so only changed blocks are rebuilt. Toolbar state is synchronized once per animation frame. History stores document snapshots (structurally shared), bounded by `historyLimit`; typing or deleting within 1 s coalesces into one step.

| Metric | Budget |
|---|---|
| `RichTextEditor.create` with 200 paragraphs | < 80 ms in headless Chromium (e2e performance test) |
| Typing a character in a 200-paragraph document | < 16 ms in headless Chromium (e2e performance test) |

## 26. Supported data scale

Documents of a few hundred blocks. Lists nest to depth 4 (five levels). Lengths are counted in code points of the plain text, where block boundaries count as one line break.

## 27. Usage examples

```ts
import { RichTextEditor } from '@absoluteui/components/rich-text-editor';

const host = document.createElement('div');
document.body.append(host);
const editor = RichTextEditor.create(host, { label: 'Description', valueFormat: 'markdown', headings: [2, 3], maxLength: 2000, showCounter: true });
editor.setMarkdown('## Summary\n\nSee [the docs](https://example.com/docs).');
```

More examples, type-checked in CI: `metadata/rich-text-editor/examples.json`. Standalone converters: `richTextFromHtml`, `richTextToHtml`, `richTextFromMarkdown`, `richTextToMarkdown`.

## 28. Edge cases

- Paste: HTML is sanitized and mapped to the model; without HTML, plain text is inserted (line breaks become paragraphs). Pasting into a code block inserts plain text only. In plain mode only text is pasted.
- Dragging text inside the editor to move it is disabled; dropping external text or HTML inserts it at the drop point.
- Marks and links are unavailable inside code blocks (tools are `aria-disabled`).
- Mark toggles with a collapsed selection apply to the next typed text.
- Applying a link with nothing selected inserts the address as linked text; Mod+K with the caret in a link edits that link.
- Headings outside `headings` (from HTML, Markdown, or `h4`-`h6`) map to the deepest allowed level that is not deeper (for example `h5` becomes `h3`), or to the first allowed level when none qualifies.
- Consecutive quote blocks are output as one `<blockquote>` with several paragraphs.
- Backspace removes a whole grapheme cluster (for example an emoji with a skin-tone modifier).
- IME composition that replaces a selection deletes the selection through the model first; the composed text is reconciled at `compositionend`.
- `showCounter` without `maxLength`, `minLength > maxLength`, `maxRows < rows`, an empty `headings`, or unknown toolbar items throw `RICH_TEXT_EDITOR_OPTIONS`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `RICH_TEXT_EDITOR_OPTIONS` | configuration | Missing label; invalid `value`, `mode`, `valueFormat`, lengths, `toolbar`, `headings`, `linkSchemes` (including javascript/data/vbscript), `rows`, `maxRows`, boolean/string options, or `validate`; or `showCounter` without `maxLength`. |
| Validation (`validity.error`) | validation | `value-missing`, `too-short`, `too-long`, `custom`. |

A failed construction leaves the host untouched (no rendering, listeners, or subscriptions). Unsupported editing input types (for example font color or horizontal rule) are ignored.

## 30. Known limitations

- No tables, images, colors, fonts, or font sizes; such content is dropped on paste.
- Headings are limited to levels 1-3.
- Moving text by dragging inside the editor is disabled.
- Markdown is a CommonMark subset: ATX headings, paragraphs, hard breaks, block quotes, fenced code, nested bullet and ordered lists, emphasis, strong, strike, code spans, links, autolinks, and escapes. Underline is written and read as `<u>...</u>` (the only inline HTML recognized); alignment has no Markdown form and is dropped; thematic breaks are read as paragraph separators.
- Switching from rich to plain mode discards formatting.
- Toolbar arrow keys are not mirrored in RTL.
- IME composition and mobile virtual keyboards have been tested only in Chromium.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Tables, images, horizontal rules, colors, fonts, and inline styles.
- Mentions, collaborative editing, comments, or track changes.
- Syntax highlighting in code blocks.
- Custom block or mark types.

## 32. TypeScript definitions

```ts
type RichTextMode = 'rich' | 'plain';
type RichTextValueFormat = 'html' | 'markdown' | 'text';
type RichTextToolbarItem =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link'
  | 'bulletList' | 'orderedList' | 'quote' | 'codeBlock'
  | 'alignStart' | 'alignCenter' | 'alignEnd' | 'alignJustify'
  | 'undo' | 'redo' | 'clearFormatting' | '|';
interface RichTextEditorConfig { validationTiming: ValidationTiming; markdownShortcuts: boolean; historyLimit: number }
interface RichTextEditorValueDetail { value: string; validity: FieldValidity }
interface RichTextEditorFormatState {
  marks: RichTextMark[];
  block: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'codeBlock' | 'bulletList' | 'orderedList';
  align: RichTextAlign;
  link: string | null;
  canUndo: boolean;
  canRedo: boolean;
}
type RichTextMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code';
type RichTextAlign = 'start' | 'center' | 'end' | 'justify';
type RichTextHeadingLevel = 1 | 2 | 3;
function richTextFromHtml(html: string, headings?: readonly RichTextHeadingLevel[], doc?: Document): RichTextDocument;
function richTextToHtml(doc: RichTextDocument): string;
function richTextFromMarkdown(markdown: string, validateUrl: (url: string) => string | null, headings?: readonly RichTextHeadingLevel[]): RichTextDocument;
function richTextToMarkdown(doc: RichTextDocument): string;
```

`RichTextDocument`, `RichTextBlock`, and `RichTextRun` describe the model (a flat list of blocks with runs of marked text).

## 33. Vanilla JS example

```ts
import { RichTextEditor } from '@absoluteui/components/rich-text-editor';
import '@absoluteui/components/rich-text-editor/style.css';

const host = document.querySelector<HTMLElement>('#release-notes');
if (host) {
  const notes = RichTextEditor.create(host, { label: 'Release notes', name: 'notes', required: true, maxLength: 5000, showCounter: true, maxRows: 20 });
  host.addEventListener('aui-change', () => {
    if (!notes.validity.valid) notes.reportValidity();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiRichTextEditor } from '@absoluteui/angular/rich-text-editor';

@Component({
  selector: 'app-release-notes',
  imports: [ReactiveFormsModule, AuiRichTextEditor],
  template: `<aui-rich-text-editor label="Release notes" valueFormat="markdown" [maxLength]="5000" [showCounter]="true" [formControl]="notes"></aui-rich-text-editor>`,
})
export class ReleaseNotesComponent {
  readonly notes = new FormControl('', { nonNullable: true, validators: [Validators.required] });
}
```

`AuiRichTextEditor` implements `ControlValueAccessor` and `Validator`, so it also works with `ngModel`.

## 35. React example

```tsx
import { useState } from 'react';
import { AuiRichTextEditor } from '@absoluteui/react/rich-text-editor';

export function Example() {
  const [value, setValue] = useState<string>('');
  return <AuiRichTextEditor label="Release notes" valueFormat="markdown" maxLength={5000} showCounter value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiRichTextEditor } from '@absoluteui/vue/rich-text-editor';
const value = ref<string>('');
</script>

<template>
  <AuiRichTextEditor v-model="value" label="Release notes" value-format="markdown" :max-length="5000" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
