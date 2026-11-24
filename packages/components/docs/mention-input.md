# Mention Input

> Package: `@absoluteui/components/mention-input` | Styles: `@absoluteui/components/mention-input/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

A plain-text field that suggests people, tags, or other entities when the user types a trigger character such as `@` or `#`. Suggestions come from an async provider you supply: calls are debounced, and every query gets its own `AbortSignal`, so a stale answer is never shown. Inserted mentions are kept as structured tokens `{ id, label, trigger, start, end }` in the value, and their offsets follow every edit; editing inside a mention turns it back into plain text. Nothing is rendered as HTML. `MentionInput` is a Form control: it validates, serializes, and resets with Form, and native forms receive a hidden input with the JSON value.

## 2. Anatomy

```text
<div class="aui-field aui-mention-input">
  <label class="aui-field__label">Comment</label>
  <div class="aui-field__description">help</div>
  <textarea class="aui-mention-input__input" aria-autocomplete="list" aria-controls aria-activedescendant aria-describedby></textarea>
  <span class="aui-visually-hidden">Type @ for people, # for tags to mention.</span>
  <div class="aui-field__counter">480 characters remaining</div>
  <div class="aui-field__error">error</div>
  <div class="aui-mention-input__popup" popover="manual">            (top layer while open)
    <ul class="aui-mention-input__list" role="listbox" aria-label="Suggestions">
      <li class="aui-mention-input__option" role="option" aria-selected>@Ana <span>People team</span></li>
    </ul>
    <div class="aui-mention-input__status">Searching… | No matches</div>
  </div>
  <input type="hidden" name="comment" value='{"text":"…","mentions":[…]}'>
</div>
```

## 3. When to use

- Comments, notes, and messages that reference people (`@`) or topics (`#`) by id.
- Any text where the server must know exactly which entity was referenced, not just the typed name.

## 4. When not to use

- Picking entities without free text: use Combobox or Multi Select.
- Formatted text (bold, lists, links): use Rich Text Editor.
- Values that must not contain free text.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `input` | `HTMLTextAreaElement \| HTMLInputElement` | The native field. |
| `value` | `MentionInputValue` | `{ text, mentions }`, mentions sorted by `start`. |
| `expanded` | `boolean` | Whether the suggestion list is open. |
| `name` / `label` / `disabled` | | Form control contract. |
| `validity` | `FieldValidity` | `{ valid, error, message }`. |
| `dirty` / `touched` | `boolean` | Form state. |
| `options` | `Readonly<MentionInputOptions>` | Current options. |

Options (`MentionInputOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label and accessible name. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `placeholder` | `string` | - | No | Supplementary hint. |
| `triggers` | `readonly MentionTrigger[]` | - (required) | No | `{ char, provider(query, { signal, trigger }), label?, minChars? }`. |
| `value` | `MentionInputValue \| string` | `''` | No | Initial value; restored by `reset()`. |
| `name` | `string` | - | No | Form field name; the hidden input carries the JSON value. |
| `required` | `boolean` | `false` | No | Empty text is invalid. |
| `disabled` | `boolean` | `false` | No | Disable the field. |
| `readOnly` | `boolean` | `false` | No | Not editable; no suggestions. |
| `multiline` | `boolean` | `true` | No (creation only) | Textarea, or a single-line input with the combobox role. |
| `rows` | `number` | `3` | No | Visible textarea rows. |
| `maxLength` | `number` | - | No | Validated, not truncated. |
| `showCounter` | `boolean` | `false` | No | Character counter; requires `maxLength`. |
| `validate` | `(value: MentionInputValue) => string \| null` | - | No | Consumer validation. |
| `icons` | `Partial<{ error: IconRef }>` | - | No | Icon overrides. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages first appear. |
| `debounce` | `number` | `200` | Yes | Milliseconds before the provider is called (0 to 5000). |
| `maxSuggestions` | `number` | `8` | Yes | Most suggestions shown (1 to 50). |
| `locale` | `string` | common `locale` | Yes (inherited) | Message locale. |

## 6. Methods

| Method | Description |
|---|---|
| `MentionInput.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set text or `{ text, mentions }` (no events); a string clears the mentions; mismatched mentions throw. |
| `update(options)` | Merge and apply options; `multiline` is fixed at creation. |
| `reportValidity()` | Show messages now; returns validity. |
| `setCustomError(message)` | Show or clear (`null`) an external error. |
| `getFormValue()` | The value object. |
| `focus()` | Focus the field. |
| `reset()` | Restore the initial value and clear form state. |
| `destroy()` | Remove rendering, listeners, pending queries, and the form registration. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-input` | `MentionInputValueDetail` `{ value, validity }` | Every edit, including an inserted mention. |
| `aui-change` | `MentionInputValueDetail` | A mention was inserted, or focus left the field with a changed value. |
| `aui-mention` | `MentionInputMentionDetail` `{ mention }` | A suggestion was inserted. |

## 8. Slots/content areas

None. Suggestion rows render `trigger + label` and the optional `description` as text.

## 9. CSS parts/hooks

`aui-mention-input`, `aui-mention-input--invalid|disabled`, `aui-mention-input__input`, `aui-mention-input__popup`, `aui-mention-input__list`, `aui-mention-input__option`, `aui-mention-input__option--active`, `aui-mention-input__option-label`, `aui-mention-input__option-description`, `aui-mention-input__status`, plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/mention-input/tokens.json` (verified in CI). Global tokens only: the shared field surface (`control-height-md`, `color-border-strong`, `radius-md`), suggestion colors (`color-hover`, `color-selected`, `color-selected-text`), the popup (`color-surface`, `shadow-md`, `popover-max-height`), and `color-focus-ring`.

## 11. States

Empty; filled; suggestions open; loading; no matches; provider failed; single-line or multiline; required; disabled; read-only; invalid; counter over the limit.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | a trigger character typed at the start or after whitespace | open, "Searching…"; the provider is called after `debounce` ms |
| open | more characters typed | the previous query is aborted; a new one starts |
| open | provider answers | suggestions listed (first active) or "No matches"; the count is announced |
| open | provider rejects | "Suggestions could not be loaded." (announced) |
| open | Enter, Tab, or a click on a suggestion | mention inserted with a trailing space; `aui-input`, `aui-mention`, `aui-change` |
| open | Escape, whitespace, caret leaves the trigger, focus leaves | closed (pending query aborted) |
| mention | an edit inside its text | the mention becomes plain text |
| any | focus leaves with a changed value | `aui-change` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Trigger character (`@`, `#`) | Field | Opens suggestions for the text typed after it. |
| ArrowDown / ArrowUp | Suggestions open | Move the active suggestion (wraps). |
| Enter / Tab | Suggestions open | Insert the active suggestion. |
| Escape | Suggestions open | Close until the caret leaves this trigger. |
| Space | Suggestions open | Ends the query; suggestions close. |
| Other keys | Field | Native text editing. |

## 14. ARIA contract

- Single-line: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls` (while open), `aria-activedescendant`.
- Textarea: native textbox role (ARIA does not allow `combobox` on a textarea) with `aria-autocomplete="list"`, `aria-controls`, and `aria-activedescendant` while open.
- The list is `role="listbox"` named "Suggestions"; each suggestion is `role="option"`; the active one has `aria-selected="true"`.
- `aria-describedby`: help text, counter, error, and the trigger hint ("Type @ for people, # for tags to mention.").
- `aria-invalid="true"` while an error is shown; `aria-busy="true"` on the popup while loading.

## 15. Accessibility notes

- Counts ("3 suggestions"), "No matches", failures, and inserted mentions ("Ana mentioned") are announced politely (WCAG 4.1.3).
- Give each trigger a `label` such as "@ for people" so the hint is meaningful.
- Pointer selection does not move focus from the field.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

The field fills its container. The popup is at most 24rem wide (and never wider than the viewport) and flips above the field when there is no room below.

## 17. RTL behavior

Text follows the document direction; the popup aligns with the field's inline start.

## 18. Theme behavior

Colors come from global tokens in all three themes. Forced colors: the active suggestion uses `Highlight` and `HighlightText`, the popup border `CanvasText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { mentionInput: { debounce: 300, maxSuggestions: 10, validationTiming: 'input' } } });
```

## 20. Component configuration support

Instance `validationTiming`, `debounce`, `maxSuggestions`, and `locale` override configuration; configuration changes re-render existing fields.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`) for the validation message.

## 23. Security behavior

The field is a native textarea or input; labels, descriptions, and statuses use `textContent`. Provider results are validated (`id` and `label` must be strings) before they are shown. The value is plain text with offsets, never HTML, so it can be stored and rendered as text without sanitizing; if you render mentions as links later, build the elements yourself from the tokens.

## 24. Data handling behavior

The provider receives the query and an `AbortSignal`; nothing is stored or sent elsewhere. Superseded queries are aborted, and late answers are ignored even when the provider ignores the signal.

## 25. Performance characteristics

Each edit runs one string diff (resolved with the caret position) and one pass over the mentions. Provider calls are debounced and at most one is in flight.

## 26. Supported data scale

Texts of 10,000 characters with 200 mentions; up to 50 suggestions shown at once (`maxSuggestions`). Filter large directories on the server.

## 27. Usage examples

```ts
import { MentionInput, type MentionSuggestion } from '@absoluteui/components/mention-input';

const people: MentionSuggestion[] = [{ id: 'u1', label: 'Ana', description: 'People team' }, { id: 'u2', label: 'Ben' }];
const host = document.querySelector<HTMLElement>('#comment');
if (host) {
  MentionInput.create(host, {
    label: 'Comment',
    triggers: [{ char: '@', label: '@ for people', provider: (query) => Promise.resolve(people.filter((p) => p.label.toLowerCase().startsWith(query.toLowerCase()))) }],
  });
}
```

More examples, type-checked in CI: `metadata/mention-input/examples.json`.

## 28. Edge cases

- A trigger counts only at the start of the text or after whitespace, so `ana@example.com` does not open suggestions.
- Typing directly after a mention (no space) keeps the mention; typing or deleting inside it removes the token and keeps the text.
- When the text after the caret already starts with a space, no second space is inserted.
- Offsets are UTF-16 indices (the same as `selectionStart`), so emoji in the text are counted as the browser counts them.
- `setValue({ text, mentions })` throws when a mention's text range does not equal `trigger + label` or mentions overlap.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `MENTION_INPUT_OPTIONS` | configuration | Blank label, no triggers, a trigger char that is not a single non-space character or is repeated, a provider that is not a function, invalid `minChars`, `rows`, or `maxLength`, `showCounter` without `maxLength`, a value whose mentions do not match its text, or changing `multiline` after creation. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration. |

A rejected provider shows "Suggestions could not be loaded." and never throws. Invalid options throw before the host is modified.

## 30. Known limitations

- Mentions are not highlighted inside the field (a native textarea cannot style ranges).
- Inserting a suggestion is not part of the browser's undo history.
- Queries stop at whitespace; multi-word labels are found by their first word.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Rich text, HTML, or Markdown rendering.
- Mentions without a trigger character.

## 32. TypeScript definitions

```ts
interface MentionSuggestion { readonly id: string; readonly label: string; readonly description?: string }
type MentionProvider = (query: string, context: { readonly signal: AbortSignal; readonly trigger: string }) => Promise<readonly MentionSuggestion[]>;
interface MentionTrigger { readonly char: string; readonly provider: MentionProvider; readonly label?: string; readonly minChars?: number }
interface MentionToken { readonly id: string; readonly label: string; readonly trigger: string; readonly start: number; readonly end: number }
interface MentionInputValue { readonly text: string; readonly mentions: readonly MentionToken[] }
interface MentionInputConfig { validationTiming: 'blur' | 'input' | 'submit'; debounce: number; maxSuggestions: number }
interface MentionInputOptions extends Partial<MentionInputConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  placeholder?: string;
  value?: MentionInputValue | string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  showCounter?: boolean;
  triggers: readonly MentionTrigger[];
  validate?: (value: MentionInputValue) => string | null;
  locale?: string;
  icons?: Partial<{ error: IconRef }>;
}
interface MentionInputValueDetail { value: MentionInputValue; validity: FieldValidity }
interface MentionInputMentionDetail { mention: MentionToken }
```

## 33. Vanilla JS example

```ts
import { MentionInput } from '@absoluteui/components/mention-input';
import '@absoluteui/components/mention-input/style.css';

const host = document.querySelector<HTMLElement>('#note');
if (host) {
  MentionInput.create(host, {
    label: 'Note',
    name: 'note',
    triggers: [{ char: '#', label: '# for tags', provider: (query) => Promise.resolve([{ id: 'payroll', label: 'payroll' }].filter((t) => t.label.startsWith(query))) }],
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { MentionInputValue, MentionTrigger } from '@absoluteui/components/mention-input';
import { AuiMentionInput } from '@absoluteui/angular/mention-input';

@Component({
  selector: 'app-comment',
  imports: [AuiMentionInput],
  template: `<aui-mention-input label="Comment" [triggers]="triggers" [(value)]="comment"></aui-mention-input>`,
})
export class CommentComponent {
  comment: MentionInputValue = { text: '', mentions: [] };
  readonly triggers: MentionTrigger[] = [{ char: '@', label: '@ for people', provider: (query) => Promise.resolve([{ id: 'u1', label: 'Ana' }].filter((p) => p.label.startsWith(query))) }];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
