# Color Picker

> Package: `@absoluteui/components/color-picker` | Styles: `@absoluteui/components/color-picker/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Picks a color through a saturation and brightness area, a hue slider, and an optional opacity slider, or by typing hex, `rgb()`, or `hsl()` text. Apps can supply preset and recent swatches with spoken names; a screen eyedropper appears where the browser has the `EyeDropper` API; an optional hint shows the WCAG contrast ratio against a background. The panel is inline or opens in a popup from a trigger button. `ColorPicker` is a Form control: its value is a hex string (`#rrggbb`, or `#rrggbbaa` with `alpha`) or `null`, and native forms receive a hidden input.

## 2. Anatomy

```text
<div class="aui-field aui-color-picker aui-color-picker--popup">
  <label class="aui-field__label" for="trigger">Brand color</label>
  <button class="aui-color-picker__trigger" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="label text">
    <span class="aui-color-picker__swatch" aria-hidden="true"></span><span class="aui-color-picker__trigger-text">#2563eb</span>
  </button>
  <div class="aui-color-picker__panel" role="dialog" popover="manual" aria-labelledby="label">   (role="group" inline)
    <div class="aui-color-picker__area"><div class="aui-color-picker__thumb" role="slider" aria-valuetext="Saturation 84%, brightness 92%"></div></div>
    <div class="aui-color-picker__slider--hue"><div role="slider" aria-label="Hue"></div></div>
    <div class="aui-color-picker__slider--alpha" hidden><div role="slider" aria-label="Opacity"></div></div>
    <div class="aui-color-picker__formats" role="group" aria-label="Color format"><button aria-pressed="true">HEX</button>...</div>
    <div class="aui-color-picker__row"><span class="aui-color-picker__preview"></span><input class="aui-color-picker__input"><button eyedropper><button clear></div>
    <div class="aui-color-picker__swatches" role="group" aria-label="Preset colors"><button aria-label="Blue" aria-pressed="true"></button>...</div>
    <div class="aui-color-picker__swatches" role="group" aria-label="Recent colors">...</div>
  </div>
  <div class="aui-field__description">help</div>
  <p class="aui-color-picker__contrast">Contrast 5.17:1 against #ffffff. Passes AA.</p>
  <div class="aui-field__error">error</div>
  <input type="hidden" name="brand">
</div>
```

## 3. When to use

- Brand, theme, label, or calendar colors chosen freely by the user.
- Colors that must meet a contrast target against a known background (contrast hint).

## 4. When not to use

- A small fixed set of colors: use Radio Group or Toggle Group with color names.
- Wide-gamut or print color spaces (Display P3, CMYK): the picker works in sRGB.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `input` | `HTMLInputElement` | The value text field. |
| `value` | `ColorPickerValue` | The hex value, or `null`. |
| `open` | `boolean` | Whether the popup is open. |
| `validity` | `FieldValidity` | Current validity. |
| `options` | `Readonly<ColorPickerOptions>` | Current options. |

Options (`ColorPickerOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label (accessible name). |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `value` | `ColorPickerValue` | `null` | No | Hex, `rgb()`, or `hsl()` text (normalized to hex), or `null`. |
| `name` | `string` | - | No | Form field name; a hidden input submits the hex value. |
| `required` | `boolean` | `false` | No | A color must be chosen. |
| `disabled` | `boolean` | `false` | No | Disable the picker. |
| `readOnly` | `boolean` | `false` | No | Show the value without allowing changes. |
| `alpha` | `boolean` | `false` | No | Opacity slider; the value becomes `#rrggbbaa`. |
| `mode` | `'popup' \| 'inline'` | `'popup'` | No | Popup from a trigger, or the panel in place. |
| `presets` | `readonly (string \| ColorSwatch)[]` | - | No | Preset swatches with optional spoken names. |
| `recent` | `readonly (string \| ColorSwatch)[]` | - | No | Recent colors supplied by the app. |
| `eyeDropper` | `boolean` | `true` | No | Offer the eyedropper where `EyeDropper` exists. |
| `clearable` | `boolean` | `!required` | No | Clear button (value `null`). |
| `contrastWith` | `string` | - | No | Background for the WCAG contrast hint. |
| `validate` | `(value: string) => string \| null` | - | No | Consumer validation of the hex value. |
| `icons` | `Partial<ColorPickerIcons>` | - | No | `error`, `eyeDropper`, `clear` icons. |
| `format` | `ColorFormat` | `'hex'` | Yes | Text format of the value field. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages appear. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of messages and value text. |

## 6. Methods

| Method | Description |
|---|---|
| `ColorPicker.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the value (color text or `null`; no event). Invalid text throws. |
| `show()` / `hide(restoreFocus?)` | Open or close the popup. |
| `reportValidity()` | Show messages now and return validity. |
| `setCustomError(message)` | Show or clear (`null`) an external error. |
| `focus()` | Focus the trigger (popup) or the area thumb (inline). |
| `reset()` | Restore the initial value and clear validation state. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Close the popup, abort the eyedropper, remove rendering and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-input` | `{ value, validity }` | The value changes while dragging, with a key, or on any commit. |
| `aui-change` | `{ value, validity }` | The value was committed: pointer release, key, swatch, typed text, eyedropper, or clear. |
| `aui-open` / `aui-close` | `null` (does not bubble) | The popup opened or closed. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-color-picker`, `aui-color-picker--popup|inline|disabled|readonly|invalid|empty`, `__trigger`, `__trigger-swatch`, `__trigger-text`, `__panel`, `__area`, `__area-thumb`, `__slider`, `__slider--hue|alpha`, `__slider-thumb`, `__thumb`, `__formats`, `__format`, `__row`, `__preview`, `__input`, `__icon-button`, `__eyedropper`, `__clear`, `__swatches`, `__swatch`, `__swatch-button`, `__contrast` (with `data-verdict`), plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/color-picker/tokens.json` (verified in CI). The component has no component tokens; surfaces, borders, focus, and selection use global tokens. The color gradients and the chosen color itself are color data, not theme colors.

## 11. States

Popup closed or open; inline; empty (no color); with opacity; read-only; disabled; invalid (required and empty, unparsable text, `validate`, custom error); dragging.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| popup closed | trigger click, Enter, or Space | open; focus on the area; `aui-open` |
| popup open | Escape or trigger | closed; focus on the trigger; `aui-close` |
| popup open | focus leaves the field and panel, or an outside press | closed |
| any | arrow, Page, Home, or End on a thumb | new value; `aui-input` and `aui-change` |
| any | press and drag on the area or a slider | `aui-input` per move; `aui-change` on release |
| dragging | pointer cancel | the value before the drag |
| any | valid text plus Enter or blur | new value; `aui-change` |
| any | unparsable text | error shown; the value is kept |
| any | swatch, eyedropper pick, clear | new value; `aui-change` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space | Trigger | Open or close the popup. |
| Escape | Popup | Close and return focus to the trigger. |
| ArrowRight / ArrowLeft | Area | Saturation by 1% (mirrored in right-to-left); Shift: 10%. |
| ArrowUp / ArrowDown | Area | Brightness by 1%; Shift: 10%. |
| Page Up / Page Down | Area | Brightness by 10%. |
| Home / End | Area | Saturation 0% or 100%. |
| Arrow keys | Hue or opacity slider | One degree or 1% (Shift: 10); horizontal arrows follow the reading direction. |
| Page Up / Page Down | Hue or opacity slider | Ten degrees or 10%. |
| Home / End | Hue or opacity slider | Minimum or maximum. |
| Enter | Value field | Apply the typed color. |
| Tab | Panel | Move through the controls; leaving the popup closes it. |

## 14. ARIA contract

- Trigger: `<button aria-haspopup="dialog" aria-expanded aria-controls>`, named by the label plus the current value text (`aria-labelledby`), described by help, contrast hint, and error.
- Panel: `role="dialog"` in popup mode, `role="group"` inline, labelled by the field label.
- Area thumb: `role="slider"`, `aria-valuenow` (saturation), `aria-valuetext` naming saturation and brightness.
- Hue and opacity thumbs: `role="slider"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext` ("210 degrees", "80%").
- Thumbs: `aria-readonly="true"` when read-only; `aria-disabled="true"` and `tabindex="-1"` when disabled.
- Format buttons and swatches: buttons with `aria-pressed` inside labelled groups; swatches are named by the app's label or the hex value.

## 15. Accessibility notes

- Every drag has a keyboard alternative, and typing a value is a non-dragging alternative (WCAG 2.5.7).
- Give swatches names (`{ value, label }`) so colors are not conveyed by color alone (WCAG 1.4.1).
- Thumbs and swatch buttons are 24 by 24 CSS pixels (WCAG 2.5.8).
- Clearing is announced; value changes are conveyed by the focused slider's value text.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

The panel is 16.5rem wide and never wider than its container; the popup is positioned and height-limited (it scrolls) by the positioning engine.

## 17. RTL behavior

Saturation and the hue and opacity sliders run along the reading direction: in right-to-left the gradients are mirrored and ArrowLeft increases. Brightness always runs bottom to top.

## 18. Theme behavior

Surfaces, borders, focus rings, and the pressed format use theme tokens in all three themes. Thumbs have a white ring and a black outline so they are visible on any color. Forced colors draw thumbs with `Canvas` and `CanvasText`, swatches and tracks with a `CanvasText` border, and pressed items with `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { colorPicker: { format: 'rgb', validationTiming: 'input' } } });
```

## 20. Component configuration support

Instance `format`, `validationTiming`, and `locale` override configuration; the format buttons change the format for the instance until `update({ format })`. Configuration changes re-render existing pickers.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`), `icons.eyeDropper` (default `locate`; for an eyedropper glyph pass `colorPickerIcon` from `@absoluteui/icons/set/color-picker`), and `icons.clear` (default `close`).

## 23. Security behavior

Labels, swatch names, and values use `textContent` and `aria-label`. All color input is parsed and normalized to hex before it reaches the CSSOM (`style.setProperty`), so strict CSP without `unsafe-inline` styles works and no CSS can be injected through a color.

## 24. Data handling behavior

No persistence, network access, or telemetry. Recent colors are stored by the app. The eyedropper reads one pixel only after the user's click and the browser's own prompt; it is aborted on close and destroy.

## 25. Performance characteristics

A drag move updates a few attributes and custom properties; swatches are rebuilt only on render. No layout is read except the pressed element's rectangle during a drag.

## 26. Supported data scale

Up to 64 preset and 16 recent swatches are tested; larger lists work but make the panel scroll.

## 27. Usage examples

```ts
import { ColorPicker, type ColorPickerValueDetail } from '@absoluteui/components/color-picker';

const host = document.querySelector<HTMLElement>('#label-color');
if (host) {
  ColorPicker.create(host, { label: 'Label color', value: '#16a34a', contrastWith: '#ffffff', presets: ['#16a34a', '#2563eb', '#dc2626'] });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<ColorPickerValueDetail>).detail;
    console.log('saved color', value);
  });
}
```

More examples, type-checked in CI: `metadata/color-picker/examples.json`.

## 28. Edge cases

- Grays and black keep the previous hue (and black the previous saturation), so the thumbs do not jump.
- Without `alpha`, typed or preset alpha is dropped; with `alpha`, the value always has eight hex digits.
- `#abc`, `abc`, `rgb(1 2 3 / 50%)`, `rgba(...)`, `hsl(210deg 50% 40%)`, and `hsla(...)` are accepted.
- Clearing the text and pressing Enter sets the value to `null` (required pickers then report a missing value).
- Without `EyeDropper` (Firefox, Safari) the eyedropper button is not rendered; a cancelled pick changes nothing.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `COLOR_PICKER_OPTIONS` | configuration | Blank label, unparsable `value`, `contrastWith`, or swatch, an unknown `mode`, or a non-function `validate`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration (for example an unknown `format`). |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact. Unparsable typed text is a validation error ("Enter a color such as #2563eb."), not an exception.

## 30. Known limitations

- sRGB only, 8-bit hex values.
- The eyedropper exists only in browsers with the EyeDropper API (Chromium-based browsers); it is feature-detected.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Wide-gamut values (Display P3, OKLCH).
- CSS color names such as `rebeccapurple` as typed input.

## 32. TypeScript definitions

```ts
type ColorPickerValue = string | null;
type ColorFormat = 'hex' | 'rgb' | 'hsl';
interface ColorPickerConfig { validationTiming: 'blur' | 'input' | 'submit'; format: ColorFormat }
interface ColorSwatch { value: string; label?: string }
interface ColorPickerIcons { error: IconRef; eyeDropper: IconRef; clear: IconRef }
interface ColorPickerOptions extends Partial<ColorPickerConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  value?: ColorPickerValue;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  alpha?: boolean;
  mode?: 'popup' | 'inline';
  presets?: readonly (string | ColorSwatch)[];
  recent?: readonly (string | ColorSwatch)[];
  eyeDropper?: boolean;
  clearable?: boolean;
  contrastWith?: string;
  validate?: (value: string) => string | null;
  locale?: string;
  icons?: Partial<ColorPickerIcons>;
}
interface ColorPickerValueDetail { value: ColorPickerValue; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { ColorPicker } from '@absoluteui/components/color-picker';
import '@absoluteui/components/color-picker/style.css';

const host = document.querySelector<HTMLElement>('#theme-accent');
if (host) ColorPicker.create(host, { label: 'Accent', mode: 'inline', alpha: true, value: '#2563ebcc' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { ColorPickerValue } from '@absoluteui/components/color-picker';
import { AuiColorPicker } from '@absoluteui/angular/color-picker';

@Component({
  selector: 'app-brand-color',
  imports: [AuiColorPicker],
  template: `<aui-color-picker label="Brand color" contrastWith="#ffffff" [presets]="presets" [(value)]="color"></aui-color-picker>`,
})
export class BrandColorComponent {
  color: ColorPickerValue = '#2563eb';
  readonly presets = ['#2563eb', '#16a34a', '#dc2626'];
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiColorPicker } from '@absoluteui/react/color-picker';
import type { ColorPickerValue } from '@absoluteui/components/color-picker';

export function Example() {
  const [color, setColor] = useState<ColorPickerValue>('#2563eb');
  return <AuiColorPicker label="Brand color" value={color} onValueChange={setColor} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiColorPicker } from '@absoluteui/vue/color-picker';
import type { ColorPickerValue } from '@absoluteui/components/color-picker';

const color = ref<ColorPickerValue>('#2563eb');
</script>

<template>
  <AuiColorPicker v-model="color" label="Brand color" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
