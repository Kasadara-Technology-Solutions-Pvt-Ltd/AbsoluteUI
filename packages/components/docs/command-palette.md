# Command Palette

> Package: `@absoluteui/components/command-palette` | Styles: `@absoluteui/components/kbd/style.css`, `@absoluteui/components/button/style.css`, `@absoluteui/components/empty-state/style.css`, and `@absoluteui/components/command-palette/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Keyboard-first command search in a modal dialog, opened with Ctrl+K (Cmd+K on Apple platforms; configurable) or `open()` from a button. A search field (a combobox) sits over a grouped, virtualized listbox driven by `aria-activedescendant`, so focus stays in the field. Fuzzy matching highlights the matched characters with text nodes. Sections list recent commands, the command groups, and async providers (debounced and aborted on each keystroke) with a loading state. Commands with children open a nested page (Backspace on an empty field goes back). An Empty State explains when nothing matches, and shortcuts are shown with Kbd. Commands are data: `{ id, label, keywords?, group?, description?, shortcut?, icon?, children?, disabled?, run? }`. It uses the native modal `<dialog>` with the same focus restore, scroll lock, and overlay stack as Dialog.

## 2. Anatomy

```text
<div class="aui-command-palette">
  <dialog class="aui-command-palette__dialog" aria-label="Command palette" open>
    <div class="aui-command-palette__search">
      <span class="aui-command-palette__search-icon" aria-hidden="true"></span>
      <div class="aui-command-palette__crumbs" hidden><button class="aui-command-palette__back" aria-label="Back"></button><span class="aui-command-palette__trail">Change theme</span></div>
      <input class="aui-command-palette__input" role="combobox" aria-expanded="true" aria-controls="list" aria-activedescendant="opt-3">
      <span class="aui-command-palette__spinner" aria-hidden="true" hidden></span>
    </div>
    <div class="aui-command-palette__list" id="list" role="listbox" aria-label="Results">
      <div class="aui-command-palette__canvas" role="none">
        <div class="aui-command-palette__header" role="presentation">Navigation</div>
        <div class="aui-command-palette__option aui-command-palette__option--active" role="option" aria-selected="true" id="opt-3">
          <span class="aui-command-palette__icon"></span>
          <span class="aui-command-palette__text"><span class="aui-command-palette__label">Go to <mark class="aui-command-palette__match">peo</mark>ple</span></span>
          <span class="aui-command-palette__shortcut aui-kbd">...</span>
        </div>
      </div>
    </div>
    <div class="aui-command-palette__empty" hidden>(Empty State)</div>
    <div class="aui-command-palette__error" hidden></div>
    <div class="aui-command-palette__footer" aria-hidden="true">(key hints with Kbd)</div>
    <div class="aui-command-palette__status" role="status">12 results</div>
  </dialog>
</div>
```

## 3. When to use

- Applications with many pages and actions where users want to jump anywhere from the keyboard.
- Global search that combines local commands with server results (people, records, documents).

## 4. When not to use

- As the only way to reach a feature: keep every command reachable through visible navigation.
- Choosing a value in a form: use Combobox or Select.
- A short menu of actions for one object: use Menu or Context Menu.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element (holds the dialog). |
| `dialog` | `HTMLDialogElement` | The native modal dialog. |
| `input` | `HTMLInputElement` | The search field. |
| `isOpen` | `boolean` | Whether the palette is open. |
| `query` | `string` | The current search text. |
| `recent` | `string[]` | Recent command ids, most recent first. |
| `path` | `string[]` | Ids of the open nested pages. |
| `options` | `Readonly<CommandPaletteOptions>` | Current options. |

Options (`CommandPaletteOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `commands` | `readonly Command[]` | - (required) | No | The commands (unique ids, nested through `children`). |
| `label` | `string` | `'Command palette'` | No | Accessible name of the dialog. |
| `placeholder` | `string` | `'Type a command or search'` | No | Field placeholder. |
| `providers` | `readonly CommandProvider[]` | - | No | `{ id, label, search(query, { signal }), minQueryLength? }`, top level only. |
| `recent` | `readonly string[]` | `[]` | No | Ids shown under Recent while the query is empty. |
| `recentLimit` | `number` | `5` | No | Most recent commands remembered (0 hides the section). |
| `maxResults` | `number` | `50` | No | Most results per section. |
| `icons` | `Partial<CommandPaletteIcons>` | - | No | `search`, `loading`, `back`, `submenu`. |
| `shortcut` | `string \| null` | `'Mod+K'` | Yes | Opening hotkey (`matchesHotkey` syntax); `null` for none. |
| `debounce` | `number` | `200` | Yes | Milliseconds before provider searches (0 to 2000). |
| `overscan` | `number` | `6` | Yes | Rows rendered beyond each edge. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and matching. |
| `density` | `Density` | common `density` | Yes (inherited) | Row height. |

## 6. Methods

| Method | Description |
|---|---|
| `CommandPalette.create(host, options)` | Render the closed dialog into `host`. |
| `open({ page?, query? })` | Open, optionally on a nested page and with a query. |
| `close()` / `toggle()` | Close (restores focus) or toggle. |
| `setQuery(query)` | Replace the search text and search. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Close, remove the dialog and the shortcut listener, abort searches. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-select` | `{ id, command, path, query, providerId }` | Cancelable: a command was chosen. The palette closes, then `command.run()` runs unless `preventDefault()` was called. |
| `aui-open` / `aui-close` | `null` | The palette opened or closed (do not bubble). |

## 8. Slots/content areas

None: commands are data. Labels and descriptions are text; icons are icon references; shortcuts are shown with Kbd.

## 9. CSS parts/hooks

`aui-command-palette`, `__dialog`, `__dialog--loading`, `__search`, `__search-icon`, `__input`, `__spinner`, `__crumbs`, `__back`, `__trail`, `__list`, `__canvas`, `__header`, `__option`, `__option--active`, `__icon`, `__text`, `__label`, `__match`, `__description`, `__shortcut`, `__submenu`, `__empty`, `__error`, `__footer`, `__hint`, `__status`.

## 10. Design tokens

See `metadata/command-palette/tokens.json` (verified in CI). Component tokens: `--aui-command-palette-radius` (`radius-lg`), `--aui-command-palette-bg` (`color-surface`), `--aui-command-palette-shadow` (`shadow-lg`), `--aui-command-palette-backdrop` (`color-backdrop`), and `--aui-command-palette-option-radius` (`radius-sm`). The active result uses `color-selected`, `color-selected-text`, and `color-selected-indicator`; matches are semibold and underlined.

## 11. States

Closed; open; recent; filtering; loading; provider failed; no results; nested page; disabled command.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | shortcut, `open()` | open, focus in the field, Recent and all commands listed |
| open | typing | local results now; provider results after `debounce` (loading spinner, `aria-busy`) |
| open | Enter on a command with children | nested page (trail shown) |
| nested page | Backspace on an empty field, back button | previous page |
| open | Enter or click on a command | `aui-select`, closed, focus restored, then `run()` |
| open | Escape, backdrop click, shortcut | closed, focus restored |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Ctrl + K (Cmd + K) | Page | Open or close (the `shortcut` option). |
| Down / Up | Field | Next or previous result (wraps). |
| Page Down / Page Up | Field | Move by one visible page. |
| Ctrl + Home / Ctrl + End | Field | First or last result. |
| Enter | Field | Choose the active result, or open its nested page. |
| Backspace | Empty field on a nested page | Go back. |
| Escape | Dialog | Close. |
| Tab | Dialog | Stays inside the modal dialog. |

## 14. ARIA contract

- Native modal `<dialog>` named by `aria-label`; the background is inert.
- Field: `role="combobox"`, `aria-expanded="true"`, `aria-controls` (the listbox), `aria-autocomplete="list"`, `aria-activedescendant` (the active option), `aria-description` with the nested page trail.
- Results: `role="listbox"` (`aria-busy` while searching) with `role="option"` rows (`aria-selected` on the active one, `aria-disabled`, `aria-haspopup="listbox"` for commands with children); section headers are `role="presentation"`.
- A `role="status"` region announces the result count; the key hints are `aria-hidden`.

## 15. Accessibility notes

- Opening remembers the focused element and closing restores it before the command runs (WCAG 2.4.3).
- The result count is announced after typing pauses (WCAG 4.1.3).
- The active result has a start-edge bar as well as color (WCAG 1.4.1).
- The e2e axe run covers three themes with the palette open; manual screen-reader verification is pending.

## 16. Responsive behavior

At most 40rem wide and never wider than the viewport minus a gutter; the result list grows with its content up to 24rem or 55% of the viewport height.

## 17. RTL behavior

The field, results, and footer follow the writing direction; the back and submenu chevrons are mirrored.

## 18. Theme behavior

Three themes through the role tokens; forced colors use `Highlight` and `HighlightText` for the active result; matches keep their underline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { commandPalette: { shortcut: 'Mod+Shift+P', debounce: 300 } } });
```

## 20. Component configuration support

Instance `shortcut`, `debounce`, `overscan`, `locale`, and `density` override configuration.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.search` (`search`), `icons.loading` (`spinner`), `icons.back` (`chevron-left`), `icons.submenu` (`chevron-right`); command icons come from `command.icon`.

## 23. Security behavior

Labels, descriptions, and headers are text; matches are `<mark>` elements built from text nodes. Provider results are validated (`id` and `label` strings) before rendering; invalid results count as a failure.

## 24. Data handling behavior

Recent ids are kept in memory only; persist `recent` yourself if needed. Providers are the application's functions and receive an `AbortSignal` that aborts when the query changes or the palette closes.

## 25. Performance characteristics

Local matching is one pass per keystroke over the current page (the top level includes nested commands). Provider searches are debounced and aborted. Only `visible + 2 x overscan + 1` rows exist.

## 26. Supported data scale

Tested with 10,000 commands; at most 100,000. `maxResults` limits each section (default 50).

## 27. Usage examples

```ts
import { CommandPalette } from '@absoluteui/components/command-palette';

const host = document.createElement('div');
document.body.append(host);
const palette = CommandPalette.create(host, {
  commands: [
    { id: 'new', label: 'New document', group: 'File', shortcut: 'Mod+N', run: () => { location.hash = '#/new'; } },
    { id: 'settings', label: 'Open settings', group: 'Navigation', run: () => { location.hash = '#/settings'; } },
  ],
});
document.querySelector('#search-button')?.addEventListener('click', () => { palette.open(); });
```

More examples, type-checked in CI: `metadata/command-palette/examples.json`.

## 28. Edge cases

- A provider that rejects or returns invalid data is skipped and "Some results could not be loaded." is shown.
- Typing while a provider search is pending aborts it.
- Disabled commands are listed but cannot be chosen or made active.
- An invalid `shortcut` on a command is not shown (the row still renders).

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `COMMAND_PALETTE_OPTIONS` | configuration | Commands not an array, a command without a string id or label, duplicate ids, non-function `run`, invalid `keywords`, invalid providers, non-string `recent` ids, or `recentLimit`/`maxResults` outside 0 to 1000. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration (for example a `debounce` above 2000). |

## 30. Known limitations

- One row height per density; long labels are truncated.
- Providers run at the top level only.
- The default shortcut Ctrl+K overrides the browser's search shortcut while the page has focus.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Rich (HTML) labels or custom row renderers.
- Several palettes on one page listening to the same shortcut.

## 32. TypeScript definitions

```ts
interface Command {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly group?: string;
  readonly description?: string;
  readonly shortcut?: string;
  readonly icon?: IconRef;
  readonly children?: readonly Command[];
  readonly disabled?: boolean;
  readonly run?: () => void;
}
interface CommandProvider { readonly id: string; readonly label: string; readonly search: (query: string, context: { readonly signal: AbortSignal }) => Promise<readonly Command[]>; readonly minQueryLength?: number }
interface CommandPaletteConfig { shortcut: string | null; debounce: number; overscan: number }
interface CommandPaletteOptions extends Partial<CommandPaletteConfig> {
  commands: readonly Command[];
  label?: string;
  placeholder?: string;
  providers?: readonly CommandProvider[];
  recent?: readonly string[];
  recentLimit?: number;
  maxResults?: number;
  locale?: string;
  density?: Density;
  icons?: Partial<CommandPaletteIcons>;
}
interface CommandPaletteSelectDetail { id: string; command: Command; path: string[]; query: string; providerId: string | null }
```

## 33. Vanilla JS example

```ts
import { CommandPalette } from '@absoluteui/components/command-palette';
import '@absoluteui/components/kbd/style.css';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/empty-state/style.css';
import '@absoluteui/components/command-palette/style.css';

const host = document.createElement('div');
document.body.append(host);
CommandPalette.create(host, { commands: [{ id: 'help', label: 'Open help', run: () => { location.hash = '#/help'; } }] });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiCommandPalette } from '@absoluteui/angular/command-palette';
import type { Command, CommandPaletteSelectDetail } from '@absoluteui/components/command-palette';

@Component({
  selector: 'app-shell-search',
  imports: [AuiCommandPalette],
  template: `<aui-command-palette [commands]="commands" (selected)="onSelect($event)"></aui-command-palette>`,
})
export class ShellSearchComponent {
  readonly commands: Command[] = [{ id: 'home', label: 'Go to dashboard', group: 'Navigation' }];
  last = '';
  onSelect(detail: CommandPaletteSelectDetail): void {
    this.last = detail.id;
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
