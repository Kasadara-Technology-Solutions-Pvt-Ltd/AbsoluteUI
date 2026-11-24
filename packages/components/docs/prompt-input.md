# Prompt Input

> Package: `@absoluteui/components/prompt-input` | Styles: `@absoluteui/components/button/style.css` and `@absoluteui/components/prompt-input/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

The composer of a chat or assistant. An auto-growing text field where Enter sends and Shift+Enter adds a line (or Ctrl/Cmd+Enter sends and Enter adds a line), attachments by button, paste, or drop with type, size, and count limits, an optional character or token counter (with a hook for your tokenizer), a Send button that turns into Stop while a reply streams, and an optional suggestions popup for slash commands or mentions. It is a form control like Textarea: label, help text, validation, and `Form` integration. Chat uses it as its composer; it also works on its own.

## 2. Anatomy

```text
<div class="aui-field aui-prompt-input">
  <label class="aui-field__label" for="ta">Message</label>
  <div class="aui-field__description">...</div>                         (description)
  <div class="aui-prompt-input__box">
    <ul class="aui-prompt-input__attachments" aria-label="Attachments">
      <li class="aui-prompt-input__chip">[file icon] report.pdf 120 kB <button aria-label="Remove report.pdf"></button></li>
    </ul>
    <textarea id="ta" class="aui-prompt-input__textarea" aria-multiline="true"></textarea>
    <div class="aui-prompt-input__toolbar">
      <button class="aui-prompt-input__attach" aria-label="Attach files"></button>   (attachments)
      <input type="file" hidden-by-css>
      <span class="aui-prompt-input__spacer"></span>
      <div class="aui-field__counter">12 characters remaining</div>              (showCounter)
      <button class="aui-prompt-input__send" aria-label="Send message | Stop generating"></button>
    </div>
    <ul class="aui-prompt-input__suggestions" role="listbox">                     (triggers, while open)
      <li role="option" aria-selected="true">/summarize <span>Summarize the conversation</span></li>
    </ul>
  </div>
  <div class="aui-prompt-input__hint">Enter to send, Shift+Enter for a new line</div>   (showHint)
  <div class="aui-field__error">...</div>
</div>
```

## 3. When to use

- Writing a message or prompt to an assistant, a support agent, or a colleague.
- A short text that is sent rather than saved, with optional files.
- Commands or mentions picked from a list while typing.

## 4. When not to use

- Long form text that is saved with a form: use Textarea.
- Formatted text: use Rich Text Editor.
- Single-line values: use Text Input.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `textarea` | `HTMLTextAreaElement` | The native textarea. |
| `value` | `string` | Current text. |
| `attachments` | `File[]` | Files attached now (a copy). |
| `status` | `PromptInputStatus` | `idle`, `sending`, or `streaming`. |
| `name` / `label` / `disabled` | | Form control contract. |
| `validity` | `FieldValidity` | `{ valid, error, message }`. |
| `dirty` / `touched` | `boolean` | Form state. |
| `suggestionsOpen` | `boolean` | Whether the suggestions popup is open. |
| `options` | `Readonly<PromptInputOptions>` | Current options. |

Options (`PromptInputOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Label and accessible name. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `value` | `string` | `''` | No | Initial text. |
| `name` | `string` | - | No | Form field name. |
| `placeholder` | `string` | - | No | Hint inside the field. |
| `description` | `string` | - | No | Help text. |
| `required` | `boolean` | `false` | No | Empty text without attachments is invalid. |
| `disabled` | `boolean` | `false` | No | Disables the field and buttons. |
| `status` | `'idle' \| 'sending' \| 'streaming'` | `'idle'` | No | Sending locks the field; streaming turns Send into Stop. |
| `rows` / `maxRows` | `number` | `1` / `8` | No | Minimum rows and the auto-grow limit. |
| `maxLength` | `number` | - | No | Limit in counter units (validated, not truncated). |
| `showCounter` | `boolean` | `false` | No | Show the counter; requires `maxLength`. |
| `count` | `(value: string) => number` | code points | No | Counter hook (a tokenizer). |
| `counterUnit` | `'characters' \| 'tokens'` | `characters` (`tokens` with `count`) | No | Counter text unit. |
| `attachments` | `boolean` | `false` | No | Attach button, paste, and drop. |
| `accept` | `readonly string[]` | `[]` | No | MIME types or extensions. |
| `maxFiles` | `number` | `10` | No | Most files at once. |
| `maxFileSize` | `number \| null` | `null` | No | Largest file in bytes. |
| `triggers` | `readonly PromptTrigger[]` | - | No | `{ char, suggest(query) }` popups. |
| `showHint` | `boolean` | `false` | No | Keyboard hint under the field. |
| `icons` | `Partial<PromptInputIcons>` | - | No | Icon overrides. |
| `submitKey` | `'enter' \| 'mod-enter'` | `'enter'` | Yes | Which key sends. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages first appear. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and numbers. |

## 6. Methods

| Method | Description |
|---|---|
| `PromptInput.create(host, options)` | Render into `host` (children are replaced). |
| `send()` | Send like the Send button; returns false when nothing was sent (empty, not idle, invalid, or prevented). |
| `setValue(value)` | Set the text (no events). |
| `setAttachments(files)` | Replace the files (no events, no limits). |
| `addFiles(files)` | Add files with limits; emits `aui-attachment-change`; returns refused files. |
| `openFilePicker()` | Open the file chooser. |
| `clear()` | Clear text and files (no events). |
| `update(options)` | Merge and apply options. |
| `reportValidity()` / `setCustomError(message)` / `getFormValue()` / `focus()` / `reset()` | Form control contract. |
| `destroy()` | Remove rendering, listeners, and registration. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-input` | `{ value, validity }` | The user edited the text. |
| `aui-change` | `{ value, validity }` | Native change (on blur). |
| `aui-send` | `{ text, attachments }` | The user sent (Enter, the Send button, or `send()`). Cancelable: prevent it to keep the text and files. |
| `aui-stop` | `{}` | Stop was pressed while `status` is `streaming`. |
| `aui-attachment-change` | `{ attachments, rejected }` | Files were attached or removed by the user. |
| `aui-suggestion-select` | `{ trigger, suggestion }` | A suggestion was inserted. |

## 8. Slots/content areas

None. Suggestions and file names are text.

## 9. CSS parts/hooks

`aui-prompt-input`, `aui-prompt-input--invalid`, `--disabled`, `--sending`, `--streaming`, `--dragover`, `--auto-native`, `aui-prompt-input__box`, `__textarea`, `__attachments`, `__chip`, `__chip-name`, `__chip-size`, `__chip-remove`, `__toolbar`, `__attach`, `__spacer`, `__send`, `__suggestions`, `__suggestion`, `__suggestion--active`, `__suggestion-label`, `__suggestion-description`, `__hint`, plus the shared `aui-field__*` chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/prompt-input/tokens.json` (verified in CI). Component tokens: `--aui-prompt-input-bg`, `--aui-prompt-input-border-color`, `--aui-prompt-input-radius`, `--aui-prompt-input-padding-x` (control field roles). The buttons use the Button tokens.

## 11. States

Idle, empty (Send has `aria-disabled`), filled, sending (locked, spinner), streaming (Stop), disabled, invalid, over the limit, with attachments, drag over, suggestions open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| idle, filled | Enter / Send | `aui-send`; cleared unless prevented |
| any | `update({ status: 'streaming' })` | Send becomes Stop; the field stays editable |
| streaming | Stop | `aui-stop` (the host sets `status` back) |
| typing after `/` or `@` | a trigger with suggestions | suggestions open |
| suggestions open | Enter, Tab, click | text inserted, `aui-suggestion-select` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter | Field (`submitKey: 'enter'`) | Send; Shift+Enter adds a line. |
| Ctrl/Cmd+Enter | Field (`submitKey: 'mod-enter'`) | Send; Enter adds a line. |
| ArrowDown / ArrowUp | Suggestions open | Move the active suggestion. |
| Enter / Tab | Suggestions open | Insert the active suggestion. |
| Escape | Suggestions open | Close them. |
| Tab | Any | Chip remove buttons, the field, attach, send. |

## 14. ARIA contract

- The textarea has a `<label for>`, `aria-multiline="true"`, and `aria-describedby` for help, counter, error, and hint.
- Suggestions: `role="listbox"` with `role="option"` children; the textarea gets `aria-controls` and `aria-activedescendant` while it is open.
- Send: `aria-label` "Send message" or "Stop generating"; `aria-disabled="true"` while there is nothing to send (it stays focusable).
- Attachment list: labelled "Attachments"; remove buttons are named "Remove <file>".

## 15. Accessibility notes

- Attaching, removing, and refusing files is announced; refusals also show as the field error.
- The number of suggestions is announced when the popup opens.
- The counter is announced only near or over the limit, 750 ms after typing stops.
- Enter during an IME composition never sends.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Full width; the field grows between `rows` and `maxRows`, then scrolls; chips wrap.

## 17. RTL behavior

Logical properties throughout; the send icon mirrors; the toolbar order follows the writing direction.

## 18. Theme behavior

The box draws the boundary and the focus ring (ring plus border color); invalid uses `color-error-fg`; the active suggestion uses the selected roles with an outline. Forced colors use `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { promptInput: { submitKey: 'mod-enter', validationTiming: 'input' } } });
```

## 20. Component configuration support

Instance `submitKey`, `validationTiming`, and `locale` override configuration; configuration changes re-render existing instances.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.send` (icon set `send`), `icons.stop` (`stop`), `icons.attach` (`paperclip`), `icons.remove` (`close`), `icons.file` (`file`), `icons.error` (`alert-circle`).

## 23. Security behavior

All text (label, help, file names, suggestions, messages) is set with `textContent`. Files are never read or uploaded by the component. Auto-grow writes `block-size` through the CSSOM; CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry; files stay in memory until sent or removed.

## 25. Performance characteristics

Each keystroke re-validates and re-measures once; native `field-sizing: content` is used where supported. Suggestion requests are raced, so a slow answer for an old query is dropped.

## 26. Supported data scale

Values up to 100,000 characters, up to 100 attachments, up to 50 suggestions shown.

## 27. Usage examples

```ts
import { PromptInput, type PromptInputSendDetail } from '@absoluteui/components/prompt-input';

const host = document.querySelector<HTMLElement>('#composer');
if (host) {
  PromptInput.create(host, { label: 'Message', hideLabel: true, placeholder: 'Ask a question', attachments: true, accept: ['image/*', '.pdf'] });
  host.addEventListener('aui-send', (event) => {
    const { text, attachments } = (event as CustomEvent<PromptInputSendDetail>).detail;
    host.dataset.sent = `${text} (${String(attachments.length)} files)`;
  });
}
```

More examples, type-checked in CI: `metadata/prompt-input/examples.json`.

## 28. Edge cases

- Whitespace-only text without files cannot be sent.
- A file already attached (same name, size, and date) is ignored.
- Files over the count limit are refused one by one, with one message.
- A trigger character only opens suggestions at the start of the text or after a space, so URLs and email addresses do not open it.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `PROMPT_INPUT_OPTIONS` | configuration | Blank label, an invalid status, rows or maxRows out of range, showCounter without maxLength, an invalid count, accept, maxFiles, maxFileSize, or triggers. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact. A `suggest` function that throws or rejects closes the popup.

## 30. Known limitations

- No tokenizer is bundled; the counter hook takes yours.
- Suggestions open inside the component (not in the top layer); an ancestor with `overflow: hidden` can clip them.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Rich text or HTML in the field.
- Uploading files (the host uploads what `aui-send` delivers).
- Voice input.

## 32. TypeScript definitions

```ts
type PromptSubmitKey = 'enter' | 'mod-enter';
type PromptInputStatus = 'idle' | 'sending' | 'streaming';
interface PromptSuggestion { insert: string; label: string; description?: string }
interface PromptTrigger { char: string; suggest: (query: string) => readonly PromptSuggestion[] | Promise<readonly PromptSuggestion[]> }
interface PromptInputOptions extends Partial<PromptInputConfig> {
  label: string; hideLabel?: boolean; value?: string; name?: string; placeholder?: string; description?: string;
  required?: boolean; disabled?: boolean; status?: PromptInputStatus; rows?: number; maxRows?: number;
  maxLength?: number; showCounter?: boolean; count?: (value: string) => number; counterUnit?: 'characters' | 'tokens';
  attachments?: boolean; accept?: readonly string[]; maxFiles?: number; maxFileSize?: number | null;
  triggers?: readonly PromptTrigger[]; showHint?: boolean; locale?: string; icons?: Partial<PromptInputIcons>;
}
interface PromptInputSendDetail { text: string; attachments: File[] }
interface PromptInputAttachmentChangeDetail { attachments: File[]; rejected: PromptInputRejectedFile[] }
```

## 33. Vanilla JS example

```ts
import { PromptInput } from '@absoluteui/components/prompt-input';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/prompt-input/style.css';

const host = document.querySelector<HTMLElement>('#composer');
if (host) PromptInput.create(host, { label: 'Message', showHint: true, maxLength: 2000, showCounter: true });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuiPromptInput } from '@absoluteui/angular/prompt-input';

@Component({
  selector: 'app-composer',
  imports: [AuiPromptInput, ReactiveFormsModule],
  template: `<aui-prompt-input label="Message" [attachments]="true" [formControl]="message" (sent)="send()"></aui-prompt-input>`,
})
export class ComposerComponent {
  readonly message = new FormControl('', { nonNullable: true });
  send(): void {
    this.message.setValue('');
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
