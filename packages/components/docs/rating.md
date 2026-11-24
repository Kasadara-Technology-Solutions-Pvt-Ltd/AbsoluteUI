# Rating

> Package: `@absoluteui/components/rating` | Styles: `@absoluteui/components/rating/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Picks a score on a short scale of stars or a custom symbol: performance reviews, feedback, product quality. Half steps are optional, the rating can be cleared, and three sizes are available. `display: true` shows an existing score as a non-interactive image whose name reads like "Customer rating: 4.5 of 5". The interactive control follows the WAI-ARIA APG slider pattern (one tab stop). `Rating` is a Form control: it validates, serializes, and resets with Form, and native forms receive a hidden input.

## 2. Anatomy

```text
<div class="aui-field aui-rating aui-rating--md">
  <label class="aui-field__label">Overall performance</label>
  <div class="aui-field__description">help</div>
  <div class="aui-rating__control" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="5" aria-valuenow="3.5" aria-valuetext="3.5 of 5">
    <span class="aui-rating__item"><svg class="aui-rating__empty"/><span class="aui-rating__fill"><svg/></span></span>  (x max)
  </div>
  <div class="aui-rating__caption" aria-hidden="true">Meets expectations</div>
  <div class="aui-field__error">error</div>
  <input type="hidden" name="score">
</div>
```

## 3. When to use

- Subjective scores on a short scale: performance reviews, feedback, product quality.
- Showing an existing score in a list, a table cell, or a card (display mode).

## 4. When not to use

- Scales longer than 10, or values that need precision: use Slider or Number Input.
- Named choices without an order: use Radio Group.
- Binary choices: use Switch or Checkbox.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `value` | `RatingValue` | The score, or `null` for no rating. |
| `validity` | `FieldValidity` | Current validity. |
| `options` | `Readonly<RatingOptions>` | Current options. |

Options (`RatingOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label (accessible name). |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `max` | `number` | `5` | No | Number of symbols, 1 to 10. |
| `value` | `RatingValue` | `null` | No | Score, rounded to the step; 0 or less means no rating. |
| `allowHalf` | `boolean` | `false` | No | Half steps. |
| `clearable` | `boolean` | `true` | No | Choosing the current value again, Delete, Backspace, or 0 clears. |
| `required` | `boolean` | `false` | No | A rating must be given. |
| `disabled` | `boolean` | `false` | No | Disable the control. |
| `readOnly` | `boolean` | `false` | No | Focusable and announced, not changeable. |
| `display` | `boolean` | `false` | No | Non-interactive `role="img"` display. |
| `valueText` | `(value, max) => string` | `'{value} of {max}'` | No | Full value text. |
| `labels` | `readonly string[]` | - | No | Visible caption per whole step. |
| `name` | `string` | - | No | Form field name. |
| `validate` | `(value) => string \| null` | - | No | Consumer validation. |
| `icons` | `Partial<RatingIcons>` | star, alert-circle | No | Scale symbol and validation icon. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Yes | Symbol size. |
| `validationTiming` | `ValidationTiming` | `'blur'` | Yes | When messages appear. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number format and messages. |

## 6. Methods

| Method | Description |
|---|---|
| `Rating.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the value, rounded and clamped (no event). |
| `setCustomError(message)` | Show or clear (`null`) an external error. |
| `reportValidity()` | Show messages now and return validity. |
| `focus()` | Focus the control. |
| `reset()` | Restore the initial value and clear the validation state. |
| `update(options)` | Merge and apply options; invalid options leave the previous state. |
| `destroy()` | Remove rendering, listeners, and the form registration. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: RatingValue, validity }` | The user changed the score (pointer or key). |
| `aui-hover` | `{ value: RatingValue }` | The pointer previews a value; `null` when it leaves. Does not bubble. |

## 8. Slots/content areas

None. The symbol is replaceable through `icons.item`.

## 9. CSS parts/hooks

`aui-rating`, `aui-rating--sm|md|lg`, `aui-rating--display|readonly|disabled|invalid`, `aui-rating__control`, `aui-rating__item`, `aui-rating__item--preview`, `aui-rating__empty`, `aui-rating__fill`, `aui-rating__fill--outline`, `aui-rating__caption`, plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/rating/tokens.json` (verified in CI). Component tokens: `--aui-rating-fill` (filled symbols; falls back to `color-warning-fg`) and `--aui-rating-empty` (empty outlines; `color-border-strong`), both 3:1 against `color-surface` in the contrast gate.

## 11. States

Empty (no rating); rated; half step; hover preview; display; read-only; disabled; required; invalid; sizes sm, md, lg.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | click a symbol | that value (the left half gives a half step with `allowHalf`); `aui-change` |
| rated | click the current value (clearable) | no rating; "Rating cleared" announced |
| any | arrow, Page, Home, End, or digit | new value; `aui-change` |
| any | pointer over a symbol | preview fill and caption; `aui-hover` |
| preview | pointer leaves | the committed value |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowRight / ArrowUp | Control | Increase by one step (ArrowLeft increases in right-to-left). |
| ArrowLeft / ArrowDown | Control | Decrease by one step. |
| Page Up / Page Down | Control | One whole symbol up or down. |
| Home / End | Control | Lowest value (no rating when clearable) or the maximum. |
| 1 to 9 | Control | Set that many symbols (up to `max`). |
| 0 / Delete / Backspace | Control (clearable) | Clear the rating. |

## 14. ARIA contract

- Control: `role="slider"`, `aria-labelledby` (label), `aria-valuemin` (0 when clearable, else one step), `aria-valuemax`, `aria-valuenow`, `aria-valuetext` ("3.5 of 5", "No rating", or `valueText`), `aria-required`, `aria-readonly`, `aria-disabled`, `aria-invalid`, `aria-describedby`.
- Display mode: `role="img"` with `aria-label="{label}: {value text}"`; the visible label is `aria-hidden`; not focusable.
- Symbols and the caption are decorative.

## 15. Accessibility notes

- APG slider pattern rather than a radio group: half steps and clearing are one value on a range, and the control is a single tab stop.
- Filled and empty symbols differ in shape (solid and outline), not only in color (WCAG 1.4.1).
- Each symbol is at least 24 by 24 CSS pixels (WCAG 2.5.8).
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The control is as wide as its symbols; sizes follow `icon-size-sm|md|lg` with a minimum 24px target.

## 17. RTL behavior

Symbols run right to left, half symbols fill from the right (logical clipping), and ArrowLeft increases.

## 18. Theme behavior

Fill, outline, and focus colors are in the contrast gate. Forced colors use `Highlight` for filled symbols, `CanvasText` for outlines, and `GrayText` when disabled.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { rating: { size: 'lg', validationTiming: 'submit' } } });
```

## 20. Component configuration support

Instance `size`, `validationTiming`, and `locale` override configuration; configuration changes re-render existing ratings.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.item` replaces the star (default: the icon set's `star`, outline and solid variants). Icons without a solid variant are filled by the stylesheet. `icons.error` replaces the validation icon.

## 23. Security behavior

Labels, captions, and value text use `textContent`. Fill widths are set through the CSSOM, so a strict CSP without `unsafe-inline` styles works.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Symbols are rendered once per `max` and icon; value changes only update a CSS custom property per symbol and the ARIA attributes.

## 26. Supported data scale

1 to 10 symbols; hundreds of display-mode instances in a table.

## 27. Usage examples

```ts
import { Rating, type RatingValueDetail } from '@absoluteui/components/rating';

const host = document.querySelector<HTMLElement>('#score');
if (host) {
  Rating.create(host, { label: 'How was onboarding?', allowHalf: true, labels: ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'] });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<RatingValueDetail>).detail;
    console.log(value);
  });
}
```

More examples, type-checked in CI: `metadata/rating/examples.json`.

## 28. Edge cases

- `value: 3.7` rounds to 3.5 with `allowHalf`, otherwise to 4; `value: 0` means no rating.
- With `clearable: false`, the lowest keyboard value is one step and Delete does nothing.
- Reducing `max` below the value clamps the value.
- Touch input does not show a hover preview; a tap commits.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `RATING_OPTIONS` | configuration | Blank label, `max` outside 1 to 10, a non-finite value, or a non-function `valueText` / `validate`, or non-string `labels`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- At most 10 symbols; half steps are the finest granularity.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Arbitrary fractions such as 3.7 (values round to the step).
- A different icon per position.

## 32. TypeScript definitions

```ts
type RatingValue = number | null;
type RatingSize = 'sm' | 'md' | 'lg';
interface RatingConfig { validationTiming: ValidationTiming; size: RatingSize }
interface RatingIcons { item: IconRef; error: IconRef }
interface RatingOptions extends Partial<RatingConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  max?: number;
  value?: RatingValue;
  allowHalf?: boolean;
  clearable?: boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  display?: boolean;
  valueText?: (value: number, max: number) => string;
  labels?: readonly string[];
  name?: string;
  validate?: (value: RatingValue) => string | null;
  locale?: string;
  icons?: Partial<RatingIcons>;
}
interface RatingValueDetail { value: RatingValue; validity: FieldValidity }
interface RatingHoverDetail { value: RatingValue }
```

## 33. Vanilla JS example

```ts
import { Rating } from '@absoluteui/components/rating';
import '@absoluteui/components/rating/style.css';

const host = document.querySelector<HTMLElement>('#quality');
if (host) Rating.create(host, { label: 'Quality', value: 4, name: 'quality' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { RatingValue } from '@absoluteui/components/rating';
import { AuiRating } from '@absoluteui/angular/rating';

@Component({
  selector: 'app-review-score',
  imports: [AuiRating],
  template: `<aui-rating label="Overall performance" [allowHalf]="true" [(value)]="score"></aui-rating>`,
})
export class ReviewScoreComponent {
  score: RatingValue = 3.5;
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
