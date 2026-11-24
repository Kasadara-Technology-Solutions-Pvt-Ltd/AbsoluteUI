# Slider

> Package: `@absoluteui/components/slider` | Styles: `@absoluteui/components/slider/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

Picks a number, or a range with two thumbs, from a bounded scale such as volume, a price range, or working hours. Each thumb is a WAI-ARIA slider; range thumbs limit each other (APG multi-thumb slider). The keyboard moves by step, large step, or to the ends, and the pointer can press anywhere on the track and drag. `Slider` is a Form control: it validates, serializes, and resets with Form, and native forms receive hidden inputs.

## 2. Anatomy

```text
<div class="aui-field aui-slider [--range] [--vertical]">
  <div class="aui-slider__header"><label class="aui-field__label">Price</label><span class="aui-slider__output" aria-hidden="true">€50 to €300</span></div>
  <div class="aui-field__description">help</div>
  <div class="aui-slider__control">
    <div class="aui-slider__track"><div class="aui-slider__fill"></div></div>
    <div class="aui-slider__thumb" role="slider" tabindex="0" aria-valuenow aria-valuemin aria-valuemax aria-valuetext aria-labelledby></div>  (x2 for range)
  </div>
  <div class="aui-slider__marks" aria-hidden="true">ticks and labels</div>
  <div class="aui-field__error">error</div>
  <input type="hidden" name="price"> (x2 for range)
</div>
```

## 3. When to use

- Approximate values where the position on a scale matters more than the exact number: volume, opacity, thresholds.
- A range filter such as a price or a working-hours window.

## 4. When not to use

- Exact numbers the user types: use Number Input.
- Precise values on long scales: pair the slider with a Number Input, or use the input alone.
- Choosing among named options: use Radio Group or Toggle Group.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `value` | `SliderValue` | A number, or `[start, end]` with `range`. |
| `validity` | `ControlValidity` | Valid unless a custom error is set. |
| `options` | `Readonly<SliderOptions>` | Current options. |

Options (`SliderOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label; names the thumbs. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text, referenced by the thumbs. |
| `min` / `max` | `number` | `0` / `100` | No | Bounds; `min < max`. |
| `step` | `number` | `1` | No | Values snap to `min + n * step`. |
| `largeStep` | `number` | a tenth of the scale | No | Page Up / Page Down step. |
| `value` | `SliderValue` | `min` (or `[min, max]`) | No | A number, or `[start, end]` with `range`. |
| `range` | `boolean` | `false` | No | Two thumbs selecting `[start, end]`. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | No | Layout and key mapping. |
| `marks` | `boolean \| readonly SliderMark[]` | - | No | `true`: a tick per step (up to 100); or `{ value, label? }` marks. |
| `format` | `Intl.NumberFormatOptions` | - | No | Number format of the value text. |
| `valueText` | `(value: number) => string` | - | No | Full value text, overriding `format`. |
| `disabled` | `boolean` | `false` | No | Disable the slider. |
| `name` | `string` | - | No | Form field name; a range submits two values under the name. |
| `showValue` | `boolean` | `true` | Yes | Show the value next to the label. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the value text and the thumb names. |

## 6. Methods

| Method | Description |
|---|---|
| `Slider.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the value, snapped and clamped (no event). |
| `setCustomError(message)` | Show or clear (`null`) an external error. |
| `focus()` | Focus the (first) thumb. |
| `reset()` | Restore the initial value and clear the error. |
| `update(options)` | Merge and apply options; the value is re-snapped to new bounds and steps. |
| `destroy()` | Remove rendering, listeners, and the form registration. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-input` | `{ value: SliderValue }` | The value changes while dragging or with a key. |
| `aui-change` | `{ value: SliderValue }` | The value was committed: pointer release (when it changed) or a key. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-slider`, `aui-slider--range|vertical|disabled|invalid`, `aui-slider__header`, `aui-slider__output`, `aui-slider__control`, `aui-slider__track`, `aui-slider__fill`, `aui-slider__thumb`, `aui-slider__marks`, `aui-slider__mark`, `aui-slider__mark--active`, `aui-slider__mark-label`, plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/slider/tokens.json` (verified in CI). Component tokens: `--aui-slider-fill` (filled track and thumb boundary; falls back to `color-primary`) and `--aui-slider-track` (unfilled track; `color-border-strong`), both 3:1 against `color-surface` in the contrast gate.

## 11. States

Single or range; horizontal or vertical; marks; value shown; disabled; invalid (custom error); dragging.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | arrow, Page, Home, or End key | new value; `aui-input` and `aui-change` |
| any | press on the track | the nearer thumb jumps there and follows the pointer; `aui-input` |
| dragging | release | `aui-change` when the value changed |
| dragging | pointer cancel | the value before the drag |
| range | a thumb reaches the other | it stops there (thumbs never cross) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowRight / ArrowUp | Thumb | Increase by one step (ArrowLeft increases in right-to-left). |
| ArrowLeft / ArrowDown | Thumb | Decrease by one step. |
| Page Up / Page Down | Thumb | Increase or decrease by the large step. |
| Home / End | Thumb | Minimum or maximum (within the other thumb's limit for a range). |
| Tab | Range | Moves between the two thumbs. |

## 14. ARIA contract

- Each thumb: `role="slider"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`, `aria-labelledby` (the label, plus "Minimum" or "Maximum" for range thumbs), `aria-describedby` (help and error), `aria-orientation="vertical"` when vertical.
- Range thumbs limit each other: the start thumb's `aria-valuemax` is the end value, and the end thumb's `aria-valuemin` is the start value.
- The visible value text and the marks are `aria-hidden`; the thumbs announce values.
- `aria-invalid="true"` with a custom error; `aria-disabled="true"` and `tabindex="-1"` when disabled.

## 15. Accessibility notes

- Dragging has single-pointer (press on the track) and keyboard alternatives (WCAG 2.5.7).
- Give a meaningful `valueText` or `format` so screen readers hear "€20" or "09:00", not a raw number.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Horizontal sliders fill their container; vertical sliders are 12rem tall. The thumbs never overflow the field.

## 17. RTL behavior

Horizontal sliders run right to left: the minimum is at the right and ArrowLeft increases.

## 18. Theme behavior

The fill, track, and focus colors are in the contrast gate. Forced colors use `Highlight` for the fill and thumbs and `GrayText` for the track.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { slider: { showValue: false } } });
```

## 20. Component configuration support

Instance `showValue` and `locale` override configuration; configuration changes re-render existing sliders.

## 21. Timezone behavior

Not applicable. For times of day, use minutes as the scale and format them with `valueText` (see the working-hours example).

## 22. Icon customization points

None.

## 23. Security behavior

Labels and value text use `textContent`. Thumb positions are set through the CSSOM, so a strict CSP without `unsafe-inline` styles works.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Each move updates attributes and two CSS custom properties; marks are re-rendered with the value (at most 100).

## 26. Supported data scale

Any finite `min`, `max`, and `step`; tick marks are limited to 100 (otherwise only the ends are marked).

## 27. Usage examples

```ts
import { Slider, type SliderValueDetail } from '@absoluteui/components/slider';

const host = document.querySelector<HTMLElement>('#opacity');
if (host) {
  Slider.create(host, { label: 'Opacity', min: 0, max: 1, step: 0.05, value: 0.8, format: { style: 'percent' } });
  host.addEventListener('aui-input', (event) => {
    const { value } = (event as CustomEvent<SliderValueDetail>).detail;
    if (typeof value === 'number') document.documentElement.style.setProperty('--preview-opacity', String(value));
  });
}
```

More examples, type-checked in CI: `metadata/slider/examples.json`.

## 28. Edge cases

- When `max` is not on the step grid, the highest reachable value below `max` is the last whole step; `max` itself is reachable with End.
- `update({ min, max, step })` re-snaps the current value.
- `setValue([70, 10])` is reordered to `[10, 70]`.
- A pointer cancel (for example a scroll gesture taking over) restores the value from before the drag.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SLIDER_OPTIONS` | configuration | Blank label, `min >= max`, a non-positive or too large step, a value of the wrong shape for `range`, an unknown orientation, invalid marks, or a non-function `valueText`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Vertical sliders hide marks.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- More than two thumbs.
- Non-linear scales: map values yourself and show them with `valueText`.

## 32. TypeScript definitions

```ts
type SliderValue = number | readonly [number, number];
interface SliderConfig { showValue: boolean }
interface SliderMark { value: number; label?: string }
interface SliderOptions extends Partial<SliderConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  largeStep?: number;
  value?: SliderValue;
  range?: boolean;
  orientation?: 'horizontal' | 'vertical';
  marks?: boolean | readonly SliderMark[];
  format?: Intl.NumberFormatOptions;
  valueText?: (value: number) => string;
  disabled?: boolean;
  name?: string;
  locale?: string;
}
interface SliderValueDetail { value: SliderValue }
```

## 33. Vanilla JS example

```ts
import { Slider } from '@absoluteui/components/slider';
import '@absoluteui/components/slider/style.css';

const host = document.querySelector<HTMLElement>('#rating');
if (host) Slider.create(host, { label: 'Minimum rating', min: 1, max: 5, value: 3, marks: true, valueText: (v) => `${String(v)} stars` });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { SliderValue } from '@absoluteui/components/slider';
import { AuiSlider } from '@absoluteui/angular/slider';

@Component({
  selector: 'app-price-filter',
  imports: [AuiSlider],
  template: `<aui-slider label="Price" [range]="true" [min]="0" [max]="500" [step]="10" [format]="eur" [(value)]="price"></aui-slider>`,
})
export class PriceFilterComponent {
  price: SliderValue = [50, 300];
  readonly eur: Intl.NumberFormatOptions = { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 };
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
