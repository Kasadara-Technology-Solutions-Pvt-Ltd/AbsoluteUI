# Kbd

> Package: `@absoluteui/components/kbd` | Styles: `@absoluteui/components/kbd/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

Shows a keyboard shortcut such as "Ctrl+S" as keycaps. `Kbd` takes the hotkey syntax of `matchesHotkey` from `@absoluteui/utilities` ("Mod+Shift+K"), so a shortcut is written once and displayed for the user's platform: on Apple platforms `Mod` is Command and modifiers show as symbols, each followed by its name for assistive technology; elsewhere `Mod` is Ctrl and keys are joined by "+". It only displays; it never listens for keys.

## 2. Anatomy

```text
<span class="aui-kbd aui-kbd--{size}">
  <kbd class="aui-kbd__combo">
    <kbd class="aui-kbd__key">Ctrl</kbd>
    <span class="aui-kbd__separator">+</span>        (not on Apple platforms)
    <kbd class="aui-kbd__key">
      <span aria-hidden="true">symbol</span><span>Name (visually hidden)</span>   (symbol keys)
    </kbd>
  </kbd>
</span>
```

## 3. When to use

- Documenting a shortcut next to the command it triggers: menu items, tooltips, help pages.
- Showing a key the user should press, such as Esc or Enter.

## 4. When not to use

- Code or command-line text: use a code element.
- Listening for shortcuts: use `matchesHotkey`; Kbd only displays.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element; receives the classes. |
| `hotkey` | `string` | Current hotkey string. |
| `text` | `string` | The visible shortcut text for the resolved platform. |
| `options` | `Readonly<KbdOptions>` | Current options. |

Options (`KbdOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `hotkey` | `string` | - (required) | No | Modifiers and one key joined by "+", such as `'Mod+Shift+K'`. `Plus` is the + key. |
| `platform` | `'auto' \| 'apple' \| 'other'` | `'auto'` | Yes | `apple`: Command for `Mod`, modifier symbols, no separators; `other`: Ctrl and "+"; `auto` detects from the user agent. |
| `size` | `'sm' \| 'md'` | `'md'` | Yes | Keycap size. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of key names. |

Key names: `Mod`, `Ctrl`, `Alt`, `Shift`, `Meta`, `Enter`, `Esc` or `Escape`, `Tab`, `Space`, `Backspace`, `Delete`, `Home`, `End`, `PageUp`, `PageDown`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Plus`; any other part is shown as written (single characters in upper case). Names are case-insensitive.

## 6. Methods

| Method | Description |
|---|---|
| `Kbd.create(host, options)` | Render into `host` (children are replaced). A `<span>` host keeps it inline with text. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Remove rendering, classes, and the configuration subscription. |

## 7. Events

None. Kbd is output only.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-kbd`, `aui-kbd--sm|md`, `aui-kbd__combo`, `aui-kbd__key`, `aui-kbd__separator`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/kbd/tokens.json` (12 tokens and 3 component tokens, verified in CI). Component tokens: `--aui-kbd-bg` (falls back to `color-surface-sunken`), `--aui-kbd-border-color` (`color-border-strong`), `--aui-kbd-radius` (`radius-sm`). Keycaps use `font-family-mono`.

## 11. States

Platforms apple and other; sizes sm and md.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update({ hotkey, platform, size, locale })` | new keycaps |
| any | global configuration change | platform, size, and locale follow the configuration unless set on the instance |
| any | `destroy()` | host restored to empty |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable. Assistive technology reads it in document order. |

## 14. ARIA contract

- A `kbd` element for the combination with one nested `kbd` per key (HTML semantics for key combinations).
- Symbols (Command, Option, Shift, Control, arrows) are `aria-hidden`; a visually hidden localized name follows each.

## 15. Accessibility notes

- Screen readers hear "Command S" rather than an unknown glyph on Apple platforms.
- A shortcut should never be the only way to reach a command.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Keycaps in one combination do not wrap; the combination wraps as a unit with surrounding text.

## 17. RTL behavior

Key order follows the hotkey string in both directions; shortcuts are not mirrored.

## 18. Theme behavior

`color-text` on `--aui-kbd-bg` is in the contrast gate. Keycaps have a thicker bottom border. Forced-colors mode draws `CanvasText` borders.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { kbd: { platform: 'apple', size: 'sm' } } });
```

## 20. Component configuration support

Instance options override global and theme configuration. Configuration changes re-render existing instances.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None. Modifier and arrow symbols are Unicode characters, not icons.

## 23. Security behavior

Key text uses `textContent`; it is never parsed as HTML. CSP-safe.

## 24. Data handling behavior

With `platform: 'auto'`, reads `navigator.userAgent` on render (the same signal as `matchesHotkey`). No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant work per render: one element per key.

## 26. Supported data scale

Not data-driven.

## 27. Usage examples

```ts
import { Kbd } from '@absoluteui/components/kbd';
import { matchesHotkey } from '@absoluteui/utilities';

const SAVE = 'Mod+S';
const hint = document.querySelector<HTMLElement>('#save-shortcut');
if (hint) Kbd.create(hint, { hotkey: SAVE });
document.addEventListener('keydown', (event) => {
  if (matchesHotkey(event, SAVE)) event.preventDefault();
});
```

More examples, type-checked in CI: `metadata/kbd/examples.json`.

## 28. Edge cases

- One combination per instance: show a sequence ("G then I") as one Kbd per step.
- `Ctrl+Plus` shows the + key; `Ctrl++` is rejected.
- On Apple platforms both `Mod` and `Meta` show Command, and `Ctrl` shows Control.
- Safe in renderers that discard nodes without calling `destroy()`, such as Data Table cells: the configuration subscription holds the instance weakly, so a discarded shortcut is released.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `KBD_OPTIONS` | configuration | Missing hotkey, an empty part (`'Ctrl+'`), or an unknown platform. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid platform, size, or locale configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Platform detection with `auto` uses the user-agent string; set `platform` when it is known.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Listening for key presses: use `matchesHotkey`.
- HTML or `Node` content.

## 32. TypeScript definitions

```ts
type KbdPlatform = 'auto' | 'apple' | 'other';
type KbdSize = 'sm' | 'md';
interface KbdConfig { platform: KbdPlatform; size: KbdSize }
interface KbdOptions extends Partial<KbdConfig> {
  hotkey: string;
  locale?: string;
}
```

## 33. Vanilla JS example

```ts
import { Kbd } from '@absoluteui/components/kbd';
import '@absoluteui/components/kbd/style.css';

const host = document.querySelector<HTMLElement>('#palette-shortcut');
if (host) Kbd.create(host, { hotkey: 'Mod+Shift+P' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiKbd } from '@absoluteui/angular/kbd';

@Component({
  selector: 'app-save-hint',
  imports: [AuiKbd],
  template: `<p>Save with <aui-kbd hotkey="Mod+S"></aui-kbd></p>`,
})
export class SaveHintComponent {}
```

## 35. React example

```tsx
import { AuiKbd } from '@absoluteui/react/kbd';

export function Example() {
  return <AuiKbd hotkey="Mod+S" />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiKbd } from '@absoluteui/vue/kbd';
</script>

<template>
  <AuiKbd hotkey="Mod+S" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
