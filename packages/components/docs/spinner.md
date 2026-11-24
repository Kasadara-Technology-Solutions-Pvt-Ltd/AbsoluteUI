# Spinner

> Package: `@absoluteui/components/spinner` | Styles: `@absoluteui/components/spinner/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

An indeterminate loading indicator. The host is a `role="status"` region (implicitly `aria-live="polite"`) containing a decorative rotating icon and a localized label. It provides:
- a label that is announced politely when the spinner appears;
- an optional `delay`, so fast operations never flash a spinner;
- a static icon under reduced motion.

## 2. Anatomy

```text
<div class="aui-spinner aui-spinner--{size} [aui-spinner--pending]" role="status">
  <svg class="aui-icon aui-spinner__icon" aria-hidden="true"></svg>        (after the delay)
  <span class="aui-spinner__label [aui-spinner__label--hidden]">Loading</span>
</div>
```

## 3. When to use

- Short waits of unknown duration: loading a panel, saving a setting.
- As the announced status inside a busy region next to Skeleton placeholders.

## 4. When not to use

- Measurable progress: use ProgressBar.
- Blocking the whole page: prefer skeletons or inline progress.
- As the only feedback inside a button without a label.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The `role="status"` host. |
| `visible` | `boolean` | Whether the delay has elapsed and the content is rendered. |

Options (`SpinnerOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | localized "Loading" | No | Announced (and optionally visible) label. |
| `showLabel` | `boolean` | `false` | No | Show the label visibly; otherwise it is visually hidden but announced. |
| `icons` | `Partial<{ spinner: IconRef }>` | - | No | Icon slot override. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Yes | Icon size. |
| `delay` | `number` | `0` | Yes (init-only) | Milliseconds (integer 0-60000) before the content is shown. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the default label. |

## 6. Methods

| Method | Description |
|---|---|
| `Spinner.create(host, options?)` | Render into `host` (children are replaced). |
| `update(options)` | Merge and apply options. Changing `delay` throws `CFG_INIT_ONLY`. |
| `destroy()` | Cancel a pending delay, then remove rendering, the role, host classes, and the configuration subscription. |

## 7. Events

None.

## 8. Slots/content areas

None. The label is a text option.

## 9. CSS parts/hooks

`aui-spinner`, `aui-spinner--sm|md|lg`, `aui-spinner--pending`, `aui-spinner__icon`, `aui-spinner__label`, `aui-spinner__label--hidden`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/spinner/tokens.json` (verified against the stylesheet in CI). Key tokens: `icon-size-sm|md|lg`, `color-primary`, `color-text`, `space-2`, `font-size-sm`.

## 11. States

pending (the delay has not elapsed; the status region is empty) and visible.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| (created, `delay: 0`) | `create` | visible |
| (created, `delay > 0`) | `create` | pending |
| pending | delay elapses | visible (label inserted and announced) |
| pending / visible | `destroy()` | removed; a pending timer is cancelled |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable; no keyboard interaction. |

## 14. ARIA contract

- `role="status"` on the host (polite live region).
- The icon is `aria-hidden="true"`.
- The label is text inside the region. It is visually hidden by default and always stays in the accessibility tree.

## 15. Accessibility notes

- The region exists from creation and is empty while pending. Inserting the label into the existing region triggers a polite announcement.
- With `delay: 0` the region and its content appear in the same task, and some screen readers may not announce it. Use a delay, or create the spinner on an empty host that is already in the page.
- Rotation stops under `prefers-reduced-motion: reduce` or `animation: 'none'`. The static icon and the label remain.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Inline-level. The icon size follows `size`; the visible label wraps with the surrounding text.

## 17. RTL behavior

Logical gap between the icon and the label. The rotation direction is not mirrored.

## 18. Theme behavior

The icon uses `color-primary` and the label uses `color-text`. Forced-colors mode uses `CanvasText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { spinner: { size: 'sm', delay: 300 } } });
```

`size` applies to existing instances immediately; `delay` applies to new instances.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). `delay` is init-only; all other options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.spinner` (default `spinner`).

## 23. Security behavior

The label uses `textContent`. No inline styles; the visually hidden label uses a CSS class.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

No DOM listeners; one timer while pending and one configuration subscription. The rotation is a compositor-friendly `transform` animation. Target: under 1 ms per `Spinner.create` in headless Chromium (not yet covered by the e2e performance suite).

## 26. Supported data scale

One spinner per loading region. Many simultaneous spinners are an anti-pattern, because each one is a live region.

## 27. Usage examples

```ts
import { Spinner } from '@absoluteui/components/spinner';

const host = document.createElement('div');
document.body.append(host);
const spinner = Spinner.create(host, { label: 'Loading results', delay: 300 });
spinner.destroy();
```

More examples, type-checked in CI: `metadata/spinner/examples.json`.

## 28. Edge cases

- Destroying the spinner before the delay elapses means it never renders, which is the intended behavior for fast operations.
- Changing the label while visible updates the region text, and screen readers announce the new label.
- The default label follows the configured locale; register translations with `registerMessages('spinner', locale, { loading })`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SPINNER_OPTIONS` | configuration | Empty `label`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `size`, or `delay` outside 0-60000 or not an integer. |
| `CFG_INIT_ONLY` | configuration | `update({ delay })` on an existing instance. |

A failed construction leaves the host untouched.

## 30. Known limitations

- The announcement for `delay: 0` depends on the screen reader (see Accessibility notes).
- `delay` is init-only.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Determinate progress.
- HTML in the label.

## 32. TypeScript definitions

```ts
type SpinnerSize = 'sm' | 'md' | 'lg';
interface SpinnerIcons { spinner: IconRef }
interface SpinnerConfig { size: SpinnerSize; delay: number }
interface SpinnerOptions extends Partial<SpinnerConfig> {
  label?: string;
  showLabel?: boolean;
  locale?: string;
  icons?: Partial<SpinnerIcons>;
}
```

## 33. Vanilla JS example

```ts
import { Spinner } from '@absoluteui/components/spinner';
import '@absoluteui/components/spinner/style.css';

const host = document.querySelector<HTMLElement>('#saving');
if (host) {
  const spinner = Spinner.create(host, { label: 'Saving changes', showLabel: true, delay: 200 });
  void fetch('/api/save', { method: 'POST' }).finally(() => {
    spinner.destroy();
  });
}
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { AuiSpinner } from '@absoluteui/angular/spinner';

@Component({
  selector: 'app-results',
  imports: [AuiSpinner],
  template: `@if (loading()) { <aui-spinner label="Loading results" [delay]="300" size="sm"></aui-spinner> }`,
})
export class ResultsComponent {
  readonly loading = signal(true);
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
