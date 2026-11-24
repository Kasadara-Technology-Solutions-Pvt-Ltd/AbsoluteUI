# Code Viewer

> Package: `@absoluteui/components/code-viewer` | Styles: `@absoluteui/components/button/style.css` and `@absoluteui/components/code-viewer/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Displays read-only code with line numbers, syntax highlighting, highlighted lines, a wrap toggle, and a copy button, or a diff of two texts in a unified or side-by-side view. Highlighting covers TypeScript, JavaScript, JSON, HTML, CSS, SQL, Bash, and Markdown through a small tokenizer in the repository that produces text nodes with classes (never HTML). The diff is computed in the repository with Myers' algorithm. Files above 400 rows are virtualized, so a 10,000-line file stays fast.

## 2. Anatomy

```text
<div class="aui-code-viewer aui-code-viewer--numbers">
  <div class="aui-code-viewer__toolbar">
    <div class="aui-code-viewer__meta">
      <span class="aui-code-viewer__filename">leave.ts</span>
      <span class="aui-code-viewer__language">TypeScript</span>
      <span class="aui-code-viewer__stats" hidden></span>             (diff counts)
    </div>
    <div class="aui-code-viewer__actions">
      <div class="aui-code-viewer__modes" role="group" aria-label="Diff view" hidden>
        <button aria-pressed="true">Unified</button><button aria-pressed="false">Side by side</button>
      </div>
      <button class="aui-button" aria-pressed="false">Wrap lines</button>
      <button class="aui-button" aria-label="Copy code">Copy</button>
    </div>
  </div>
  <div class="aui-code-viewer__viewport" role="region" aria-label="Leave request handler" tabindex="0" aria-describedby="...-summary">
    <div class="aui-code-viewer__head" aria-hidden="true" hidden></div>     (side-by-side headings)
    <div class="aui-code-viewer__canvas" dir="ltr">
      <div class="aui-code-viewer__row aui-code-viewer__line">
        <span class="aui-code-viewer__num" aria-hidden="true">1</span>
        <span class="aui-code-viewer__code"><span class="aui-code-viewer__t aui-code-viewer__t--keyword">export</span> ...</span>
      </div>
    </div>
  </div>
  <span class="aui-visually-hidden aui-code-viewer__summary">4 lines, TypeScript</span>
</div>
```

## 3. When to use

- Showing source code, configuration, JSON exports, or SQL to read and copy.
- Reviewing changes between two versions of a text, such as a policy or a configuration file.
- Documentation and support pages with copyable snippets.

## 4. When not to use

- Editing code: use a text area or a dedicated editor.
- Short inline code in a sentence: use the Typography Code element.
- Rich formatted documents: use Prose or the Rich Text Editor.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `options` | `Readonly<CodeViewerOptions>` | Current options. |
| `wrap` | `boolean` | Whether long lines wrap. |
| `mode` | `CodeViewerDiffMode \| null` | The diff mode, or `null` for plain code. |
| `diff` | `DiffLine[] \| null` | The computed diff lines (`null` outside diff mode). |
| `text` | `string` | The text the copy button writes (the code, or the modified text of a diff). |
| `rowCount` | `number` | Total number of rows. |
| `renderedRowCount` | `number` | Rows in the DOM (all rows unless virtualized). |

Options (`CodeViewerOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the code region. |
| `code` | `string` | `''` | No | Source text (ignored when `diff` is set). |
| `diff` | `CodeViewerDiff \| null` | `null` | No | `{ original, modified, mode?, originalLabel?, modifiedLabel?, ignoreWhitespace? }`. |
| `language` | `CodeLanguage` | `'plain'` | No | `'typescript'`, `'javascript'`, `'json'`, `'html'`, `'css'`, `'sql'`, `'bash'`, `'markdown'`, or `'plain'`. |
| `filename` | `string` | - | No | File name shown in the toolbar. |
| `startLine` | `number` | `1` | No | Number of the first line (code view). |
| `highlightLines` | `readonly CodeViewerLineRange[]` | `[]` | No | Line numbers or `[from, to]` ranges; in a diff, modified line numbers. |
| `toolbar` | `boolean` | `true` | No | Show the toolbar. |
| `copyable` | `boolean` | `true` | No | Show the copy button. |
| `wrapToggle` | `boolean` | `true` | No | Show the wrap toggle. |
| `maxHeight` | `string \| null` | `'30rem'` | No | Maximum block size of the scroll area; `null` grows with the content (no virtualization). |
| `icons` | `Partial<CodeViewerIcons>` | - | No | `copy`, `copied`, `unified`, `split`. |
| `lineNumbers` | `boolean` | `true` | Yes | Show line numbers. |
| `wrap` | `boolean` | `false` | Yes | Wrap long lines (the side-by-side diff always wraps). |
| `tabSize` | `number` | `2` | Yes | Width of a tab in spaces (1 to 16). |
| `locale` | `string` | common | Yes (inherited) | Locale of messages and counts. |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | common | Yes (inherited) | Line and toolbar spacing. |

## 6. Methods

| Method | Description |
|---|---|
| `CodeViewer.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge and apply options; rows are rebuilt only when the content, numbering, or highlights change. |
| `scrollToLine(line, align?)` | Scroll a displayed line number (modified side in a diff) into view; `align` is `'auto'`, `'start'`, `'center'` (default), or `'end'`. |
| `copy()` | Copy the text; resolves `false` when the clipboard refused. |
| `destroy()` | Remove rendering, buttons, observers, and listeners. |

Also exported: `diffLines(original, modified, options?)` and `diffStats(lines)` (the diff without rendering), and `tokenize`, `tokenizeLines`, `splitLines`, `CODE_LANGUAGES`.

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-copy` | `{ text: string }` | The text was written to the clipboard. |
| `aui-change` | `{ wrap: boolean; mode: CodeViewerDiffMode \| null; reason: 'wrap' \| 'mode' }` | The user toggled wrapping or switched the diff mode. |

The toolbar's toggle buttons do not leak their own `aui-change` events.

## 8. Slots/content areas

None; the content is the `code` or `diff` text.

## 9. CSS parts/hooks

`aui-code-viewer`, `aui-code-viewer--wrap`, `--diff`, `--split`, `--virtual`, `--grow`, `--numbers`, `--compact`, `--comfortable`, `--spacious`, `aui-code-viewer__toolbar`, `__meta`, `__filename`, `__language`, `__stats`, `__actions`, `__modes`, `__viewport`, `__head`, `__canvas`, `__row`, `__row--split`, `__line`, `__line--insert`, `__line--delete`, `__line--highlight`, `__side`, `__num`, `__marker`, `__code`, and token classes `aui-code-viewer__t--keyword`, `--string`, `--number`, `--comment`, `--function`, `--type`, `--tag`, `--attr`, `--variable`, `--punctuation`, `--heading`, `--emphasis`, `--link`, `--code`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/code-viewer/tokens.json` (verified in CI). Component tokens: `--aui-code-viewer-bg` (`color-surface`), `--aui-code-viewer-gutter-bg` (`color-surface-sunken`), `--aui-code-viewer-line-number` (`color-text-muted`), `--aui-code-viewer-keyword` and `--aui-code-viewer-attr` (`color-link`), `--aui-code-viewer-string` (`color-success-fg`), `--aui-code-viewer-number`, `--aui-code-viewer-tag`, and `--aui-code-viewer-variable` (`color-error-fg`), `--aui-code-viewer-comment` (`color-text-muted`), `--aui-code-viewer-function` and `--aui-code-viewer-type` (`color-info-fg`), `--aui-code-viewer-added-bg` (`color-success-subtle`), `--aui-code-viewer-removed-bg` (`color-error-subtle`), `--aui-code-viewer-highlight-bg` (`color-warning-subtle`), `--aui-code-viewer-highlight-indicator` (`color-warning-fg`), `--aui-code-viewer-font-size` (`font-size-sm`), `--aui-code-viewer-radius` (`radius-md`). Every text color is in the contrast gate on the code background and on each line background.

## 11. States

Code or diff (unified, side by side); wrapped or not; with or without line numbers and toolbar; highlighted lines; virtualized above 400 rows; densities.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| not wrapped | Wrap lines button | wrapped; `aui-change` with `reason: 'wrap'` |
| unified | Side by side button | side by side; `aui-change` with `reason: 'mode'` |
| idle | Copy button | copied (check icon for 2 seconds); `aui-copy` |
| any | `update(options)` | new content or options (no event) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Code Viewer | Toolbar buttons, then the code region. |
| Arrow keys, Page Up, Page Down, Home, End | Code region | Scroll the code. |
| Enter / Space | Toolbar button | Toggle wrapping, switch the diff mode, or copy. |

## 14. ARIA contract

- The scroll area is `role="region"`, named by `label`, focusable, and described by a visually hidden summary ("120 lines, TypeScript" or "3 added, 2 removed, JSON").
- Line numbers, diff markers, and side-by-side headings are `aria-hidden="true"`.
- Added, removed, and highlighted lines begin with visually hidden "Added:", "Removed:", and "Highlighted:" text.
- Wrap and diff mode buttons are toggle buttons (`aria-pressed`); the mode buttons are a named group.

## 15. Accessibility notes

- Changes are never conveyed by color alone: the text prefixes and the `+` / `-` markers carry them.
- Copy results and option changes are announced politely; a refused clipboard is announced assertively.
- Line numbers are excluded from text selection, so selected code copies cleanly.
- In virtualized files only the rows in view are in the accessibility tree.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Fills its container. Long lines scroll horizontally with pinned line numbers, or wrap; the toolbar wraps on narrow containers. The side-by-side view always wraps its two columns.

## 17. RTL behavior

The toolbar mirrors with the page direction. The code canvas is always `dir="ltr"`, as source code is written left to right.

## 18. Theme behavior

All colors come from component tokens over role tokens and pass the contrast gate in every theme. Forced colors render tokens in `CanvasText`, line numbers in `GrayText`, and changed and highlighted lines with a `Highlight` bar.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { codeViewer: { lineNumbers: true, wrap: false, tabSize: 4 } } });
```

## 20. Component configuration support

Instance `lineNumbers`, `wrap`, `tabSize`, `locale`, and `density` override configuration.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.copy` (default `copy`), `icons.copied` (`check`), `icons.unified` (`layout-list`), and `icons.split` (`layout-columns`), all from the icon set; any `IconRef` works.

## 23. Security behavior

Code is never parsed as HTML: the tokenizer returns data and the viewer creates text nodes, so markup in the code is shown, not executed. The copy button writes plain text with the asynchronous Clipboard API.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Tokenizing is linear in the text length (about 150 ms for 10,000 TypeScript lines). The diff trims the common prefix and suffix and runs Myers' algorithm on the rest, capped at 2,000 edits. Above 400 rows, only visible rows plus 20 overscan rows on each side are rendered on the shared windowing engine; wrapped rows are measured as they render.

## 26. Supported data scale

10,000 lines tested; up to 100,000 lines.

## 27. Usage examples

```ts
import { CodeViewer } from '@absoluteui/components/code-viewer';

const host = document.querySelector<HTMLElement>('#export');
if (host) {
  const viewer = CodeViewer.create(host, { label: 'Employee export', language: 'json', code: JSON.stringify({ id: 42, name: 'Ada' }, null, 2) });
  viewer.update({ highlightLines: [3] });
}
```

More examples, type-checked in CI: `metadata/code-viewer/examples.json`.

## 28. Edge cases

- Empty code renders one empty line.
- `\r\n` and `\r` line endings are normalized; a single trailing newline does not add a line.
- Highlighted lines that do not exist are ignored; in a diff, deleted lines are never highlighted.
- When the edit distance exceeds 2,000, the changed middle shows as one deletion followed by one insertion.
- `scrollToLine` with a line that is not shown does nothing.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CODE_VIEWER_OPTIONS` | configuration | Blank label, non-string code, an invalid diff object, an unknown language, a negative or fractional start line, invalid highlight ranges, non-boolean toolbar flags, or an invalid `maxHeight`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |
| `ICON_UNKNOWN` | configuration | An icon name that is not registered. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- A fixed set of languages; scripts and styles embedded in HTML are plain text; JavaScript regular expression literals are not highlighted.
- The side-by-side view always wraps.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Editing, folding, search inside the code, and word-level diff highlighting.

## 32. TypeScript definitions

```ts
type CodeLanguage = 'typescript' | 'javascript' | 'json' | 'html' | 'css' | 'sql' | 'bash' | 'markdown' | 'plain';
type CodeViewerDiffMode = 'unified' | 'split';
type CodeViewerLineRange = number | readonly [number, number];
interface CodeViewerConfig { lineNumbers: boolean; wrap: boolean; tabSize: number }
interface CodeViewerDiff { original: string; modified: string; mode?: CodeViewerDiffMode; originalLabel?: string; modifiedLabel?: string; ignoreWhitespace?: boolean }
interface CodeViewerIcons { copy: IconRef; copied: IconRef; unified: IconRef; split: IconRef }
interface CodeViewerOptions extends Partial<CodeViewerConfig> {
  label: string;
  code?: string;
  diff?: CodeViewerDiff | null;
  language?: CodeLanguage;
  filename?: string;
  startLine?: number;
  highlightLines?: readonly CodeViewerLineRange[];
  toolbar?: boolean;
  copyable?: boolean;
  wrapToggle?: boolean;
  maxHeight?: string | null;
  locale?: string;
  density?: Density;
  icons?: Partial<CodeViewerIcons>;
}
interface CodeViewerCopyDetail { text: string }
interface CodeViewerChangeDetail { wrap: boolean; mode: CodeViewerDiffMode | null; reason: 'wrap' | 'mode' }
type DiffOp = 'equal' | 'insert' | 'delete';
interface DiffLine { op: DiffOp; text: string; originalLine: number | null; modifiedLine: number | null }
interface DiffOptions { maxEdits?: number; ignoreWhitespace?: boolean }
function diffLines(original: string, modified: string, options?: DiffOptions): DiffLine[];
```

## 33. Vanilla JS example

```ts
import { CodeViewer } from '@absoluteui/components/code-viewer';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/code-viewer/style.css';

const host = document.querySelector<HTMLElement>('#policy-diff');
if (host) {
  CodeViewer.create(host, {
    label: 'Leave policy changes',
    language: 'markdown',
    diff: { original: '# Leave\n20 days per year', modified: '# Leave\n22 days per year\nCarry over 5 days', mode: 'unified' },
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { CodeViewerCopyDetail } from '@absoluteui/components/code-viewer';
import { AuiCodeViewer } from '@absoluteui/angular/code-viewer';

@Component({
  selector: 'app-snippet',
  imports: [AuiCodeViewer],
  template: `<aui-code-viewer label="Install" language="bash" [code]="code" (copied)="onCopy($event)"></aui-code-viewer>`,
})
export class SnippetComponent {
  readonly code = 'npm install @absoluteui/components';
  copiedText = '';
  onCopy(detail: CodeViewerCopyDetail): void {
    this.copiedText = detail.text;
  }
}
```

## 35. React example

```tsx
import { AuiCodeViewer } from '@absoluteui/react/code-viewer';

export function Example() {
  return <AuiCodeViewer label="Install" language="bash" code="npm install @absoluteui/components" />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiCodeViewer } from '@absoluteui/vue/code-viewer';
</script>

<template>
  <AuiCodeViewer label="Install" language="bash" code="npm install @absoluteui/components" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
