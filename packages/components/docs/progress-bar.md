# Progress Bar

> Package: `@absoluteui/components/progress-bar` | Styles: `@absoluteui/components/progress-bar/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A determinate or indeterminate progress indicator with `role="progressbar"`. It provides:
- a visible label that is the accessible name;
- localized percentage value text (`aria-valuetext`), or custom value text;
- optional help text;
- tones (`success`, `warning`, `error`) that add a labelled icon, so meaning never depends on color alone;
- an optional one-time completion announcement.

## 2. Anatomy

```text
<div class="aui-progress-bar aui-progress-bar--{tone} [aui-progress-bar--indeterminate]">
  <div class="aui-progress-bar__header">
    <span class="aui-progress-bar__label" id="L">label</span>
    <svg class="aui-icon aui-progress-bar__icon" role="img" aria-label="Success"></svg>   (non-default tones)
    <span class="aui-progress-bar__value" aria-hidden="true">50%</span>
  </div>
  <div class="aui-progress-bar__track" role="progressbar" aria-labelledby="L" aria-describedby="D"
       aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-valuetext="50%">
    <div class="aui-progress-bar__fill"></div>   (inline size from --aui-progress)
  </div>
  <div class="aui-progress-bar__description" id="D">help text</div>
</div>
```

## 3. When to use

- Operations with measurable progress: uploads, imports, multi-step processing.
- Long operations of unknown duration, where a labelled indeterminate bar is clearer than a spinner.

## 4. When not to use

- Waits shorter than about a second: show nothing, or a delayed Spinner.
- Static quantities such as disk usage or scores: use a meter.
- Placeholder layout while content loads: use Skeleton.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `track` | `HTMLDivElement` | The `role="progressbar"` element. |
| `value` | `number \| null` | Current clamped value; `null` when indeterminate. |
| `indeterminate` | `boolean` | `value === null`. |

Options (`ProgressBarOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label; referenced by `aria-labelledby`. |
| `value` | `number \| null` | `null` | No | Current value, clamped to `[min, max]`. `null` is indeterminate. |
| `min` | `number` | `0` | No | Minimum. |
| `max` | `number` | `100` | No | Maximum; must be greater than `min`. |
| `valueText` | `(value, max) => string` | localized percentage | No | Custom `aria-valuetext` and visible value. |
| `description` | `string` | - | No | Help text; referenced by `aria-describedby`. |
| `tone` | `'default' \| 'success' \| 'warning' \| 'error'` | `'default'` | No | Semantic tone with a labelled icon. |
| `icons` | `Partial<{ success; warning; error: IconRef }>` | - | No | Icon slot overrides. |
| `showValue` | `boolean` | `true` | Yes | Show the value text next to the label. |
| `announceComplete` | `boolean` | `true` | Yes | Announce "{label} complete" once when the value reaches `max`. |
| `locale` | `string` | common `locale` | Yes (inherited) | Percentage formatting and message locale. |

## 6. Methods

| Method | Description |
|---|---|
| `ProgressBar.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the value; `null` switches to indeterminate. |
| `update(options)` | Merge and apply options. Invalid options throw and leave the current state unchanged. |
| `destroy()` | Remove rendering, host classes, and the configuration subscription. |

## 7. Events

None. Progress bars are output-only; programmatic value changes emit nothing.

## 8. Slots/content areas

None. Label, value text, and description are text options.

## 9. CSS parts/hooks

`aui-progress-bar`, `aui-progress-bar--default|success|warning|error`, `aui-progress-bar--indeterminate`, `__header`, `__label`, `__icon`, `__value`, `__track`, `__fill`, `__description`. The fill reads the `--aui-progress` custom property (a percentage). All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/progress-bar/tokens.json` (verified against the stylesheet in CI). Key tokens: `progress-height`, `color-surface-sunken`, `color-border-strong`, `color-primary`, `color-success-fg`, `color-warning-fg`, `color-error-fg`, `radius-pill`.

## 11. States

indeterminate (`value: null`), determinate, complete (`value === max`), and the tone (`default`, `success`, `warning`, `error`).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| indeterminate | `setValue(n)` | determinate (`aria-valuenow` added) |
| determinate | `setValue(null)` | indeterminate (`aria-valuenow` and `aria-valuetext` removed) |
| determinate (< max) | `setValue(max)` | complete; announces "{label} complete" once when `announceComplete` |
| complete | `setValue(< max)` then `setValue(max)` | complete again; announces again |
| any | `update({ tone })` | same value, new tone icon and fill color |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable; no keyboard interaction. |

## 14. ARIA contract

- `role="progressbar"` on the track, named by `aria-labelledby` -> visible label.
- `aria-describedby` -> description, when provided.
- `aria-valuemin` / `aria-valuemax` always set.
- `aria-valuenow` and `aria-valuetext` are set for determinate values and removed when indeterminate.
- The visible value is `aria-hidden="true"` because it duplicates `aria-valuetext`.
- The tone icon is `role="img"` with a localized label (Success, Warning, Error).

## 15. Accessibility notes

- Value changes are not announced continuously (that would be noisy). Completion is announced once through the shared polite live region.
- Tones add a labelled icon so success or failure is not conveyed by color alone (WCAG 1.4.1).
- The indeterminate sweep is replaced by a static striped bar under `prefers-reduced-motion: reduce` or `animation: 'none'`.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Fills the inline size of its container. The label wraps; the value text stays on one line at the inline end.

## 17. RTL behavior

Logical properties throughout: the fill grows from the inline start, the indeterminate sweep moves toward the inline end, and the value sits at the inline end.

## 18. Theme behavior

The track uses `color-surface-sunken` with a `color-border-strong` boundary; the fill uses `color-primary` or the tone foreground token. Forced-colors mode uses `Highlight` for the fill and `CanvasText` for the boundary.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { progressBar: { showValue: false, announceComplete: false } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.success` (default `check-circle`), `icons.warning` (default `alert-triangle`), and `icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent`; `valueText` results are rendered as text. The fill width is written as the `--aui-progress` custom property through `style.setProperty` (CSSOM, CSP-safe); no style attribute strings are generated.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

No DOM listeners; one configuration subscription. `setValue` updates attributes, text, and one custom property. Target: under 1 ms per `setValue` in headless Chromium (not yet covered by the e2e performance suite).

## 26. Supported data scale

One bar per operation. Frequent updates (every animation frame) are supported.

## 27. Usage examples

```ts
import { ProgressBar } from '@absoluteui/components/progress-bar';

const host = document.createElement('div');
document.body.append(host);
const bar = ProgressBar.create(host, { label: 'Uploading report.pdf', value: 0 });
bar.setValue(60);
```

More examples, type-checked in CI: `metadata/progress-bar/examples.json`.

## 28. Edge cases

- Values outside `[min, max]` are clamped; `value` returns the clamped value.
- The percentage is relative to the range: `min: 50, max: 150, value: 100` reads "50%".
- Locales format the percentage natively, for example `de-DE` renders "50 %" (with a no-break space).
- A bar created at `max` does not announce; repeated `setValue(max)` announces only once.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `PROGRESS_BAR_OPTIONS` | configuration | Missing label, non-finite `min`/`max`/`value`, `max <= min`, invalid tone, or non-function `valueText`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Completion is announced once per transition to `max`.
- Values are clamped rather than rejected.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Buffered or secondary progress values.
- Circular (ring) progress.
- HTML in the label, value text, or description.

## 32. TypeScript definitions

```ts
type ProgressBarTone = 'default' | 'success' | 'warning' | 'error';
interface ProgressBarIcons { success: IconRef; warning: IconRef; error: IconRef }
interface ProgressBarConfig { showValue: boolean; announceComplete: boolean }
interface ProgressBarOptions extends Partial<ProgressBarConfig> {
  label: string;
  value?: number | null;
  min?: number;
  max?: number;
  valueText?: (value: number, max: number) => string;
  description?: string;
  tone?: ProgressBarTone;
  locale?: string;
  icons?: Partial<ProgressBarIcons>;
}
```

## 33. Vanilla JS example

```ts
import { ProgressBar } from '@absoluteui/components/progress-bar';
import '@absoluteui/components/progress-bar/style.css';

const host = document.querySelector<HTMLElement>('#import');
if (host) {
  const bar = ProgressBar.create(host, { label: 'Importing contacts', value: null });
  bar.update({ max: 250, value: 40, valueText: (value, max) => `${String(value)} of ${String(max)} rows` });
}
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { AuiProgressBar } from '@absoluteui/angular/progress-bar';

@Component({
  selector: 'app-upload',
  imports: [AuiProgressBar],
  template: `<aui-progress-bar label="Uploading" [value]="progress()" [tone]="progress() === 100 ? 'success' : 'default'"></aui-progress-bar>`,
})
export class UploadComponent {
  readonly progress = signal<number | null>(null);
}
```

## 35. React example

```tsx
import { AuiProgressBar } from '@absoluteui/react/progress-bar';

export function Example() {
  return <AuiProgressBar label="Upload progress" value={40} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiProgressBar } from '@absoluteui/vue/progress-bar';
</script>

<template>
  <AuiProgressBar label="Upload progress" :value="40" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
