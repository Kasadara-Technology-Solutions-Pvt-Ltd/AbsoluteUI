# Skeleton

> Package: `@absoluteui/components/skeleton` | Styles: `@absoluteui/components/skeleton/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Decorative loading placeholders: text lines, rectangles, and circles that reserve layout while content loads. Skeletons are hidden from assistive technology. The loading state is communicated by:
- `Skeleton.markBusy(region, true)`, which sets `aria-busy="true"` on the region being loaded;
- a visually hidden status inside that region, such as a Spinner with its default hidden label.

Sizes are strictly validated CSS lengths written through the CSSOM.

## 2. Anatomy

```text
<div class="aui-skeleton aui-skeleton--text aui-skeleton--pulse" aria-hidden="true">
  <span class="aui-skeleton__line"></span>
  <span class="aui-skeleton__line"></span>
  <span class="aui-skeleton__line aui-skeleton__line--last"></span>   (60% wide)
</div>

<div class="aui-skeleton aui-skeleton--rect|circle aui-skeleton--pulse" aria-hidden="true">
  <span class="aui-skeleton__block"></span>
</div>
```

## 3. When to use

- Reserving layout for content that is loading, to reduce layout shift.
- Lists, cards, and profile headers whose shape is known in advance.

## 4. When not to use

- As the only loading feedback for assistive technology: pair it with a visually hidden status (Spinner).
- Measurable progress: use ProgressBar.
- Content whose shape is unknown.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The `aria-hidden` host. |

Options (`SkeletonOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `shape` | `'text' \| 'rect' \| 'circle'` | `'text'` | No | Placeholder shape. |
| `lines` | `number` | `3` | No | Text lines (integer 1-100). The last of several lines is 60% wide. |
| `width` | `string \| null` | 100% (circle: `2.5rem`) | No | CSS length in `px`, `rem`, `em`, `%`, or `ch`. `null` restores the default. |
| `height` | `string \| null` | line `0.75em`, rect `6rem`, circle = width | No | CSS length (per line for `text`). `null` restores the default. |
| `animation` | `'pulse' \| 'none'` | `'pulse'` | Yes | Pulse animation. Always off under reduced motion. |

## 6. Methods

| Method | Description |
|---|---|
| `Skeleton.create(host, options?)` | Render placeholders into `host` (children are replaced). |
| `Skeleton.markBusy(container, busy)` | Set (`true`) or remove (`false`) `aria-busy="true"` on the loading region. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Remove placeholders, `aria-hidden`, size custom properties, host classes, and the configuration subscription. |

## 7. Events

None.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-skeleton`, `aui-skeleton--text|rect|circle`, `aui-skeleton--pulse|none`, `aui-skeleton__line`, `aui-skeleton__line--last`, `aui-skeleton__block`. Sizes are read from the `--aui-skeleton-width` and `--aui-skeleton-height` custom properties on the host. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/skeleton/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-active` (placeholder), `color-hover` (pulse), `radius-sm` (lines and rectangles), `radius-pill` (circles), `space-2` (line gap).

## 11. States

pulse, and static (`animation: 'none'`, reduced motion, or forced colors).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| pulse | `update({ animation: 'none' })` or global config | static |
| pulse | `prefers-reduced-motion: reduce` or common `animation: 'none'` | static (CSS) |
| any | `destroy()` | host restored to empty |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable; no keyboard interaction. |

## 14. ARIA contract

- The host is `aria-hidden="true"`.
- `Skeleton.markBusy(region, true)` sets `aria-busy="true"` on the loading region; `markBusy(region, false)` removes it.

## 15. Accessibility notes

- Skeletons carry no information for assistive technology. Put a visually hidden status in the busy region, for example `Spinner.create(statusHost, { label: 'Loading profile' })`, so the loading state is announced.
- `aria-busy` support varies across screen readers; the status message is the reliable announcement.
- The pulse is disabled under `prefers-reduced-motion: reduce` and the common `animation: 'none'` setting.

## 16. Responsive behavior

Width defaults to 100% of the container and never exceeds it (`max-inline-size: 100%`). Line height is `em`-based, so it scales with the surrounding font size.

## 17. RTL behavior

Logical properties throughout. The shorter last line ends at the inline end of its content, like real text.

## 18. Theme behavior

Placeholders use `color-active` and pulse toward `color-hover`; `color-active` stays distinct from page and surface backgrounds in every built-in theme. Forced-colors mode uses `GrayText` without animation.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { skeleton: { animation: 'none' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

`width` and `height` must match `^\d+(\.\d+)?(px|rem|em|%|ch)$`. Values such as `calc(1px);background:url(x)` are rejected before anything is written. Accepted values are applied as custom properties with `style.setProperty` (CSSOM, CSP-safe); no style attribute strings are generated.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

No DOM listeners; one configuration subscription. Each render replaces at most `lines` empty spans. The pulse animates `background-color` only. Target: under 2 ms per `Skeleton.create` with 100 lines in headless Chromium (not yet covered by the e2e performance suite).

## 26. Supported data scale

Up to 100 lines per instance. For long lists, render a few skeleton rows rather than one per expected item.

## 27. Usage examples

```ts
import { Skeleton } from '@absoluteui/components/skeleton';

const host = document.createElement('div');
document.body.append(host);
Skeleton.create(host, { lines: 2 });
```

More examples, type-checked in CI: `metadata/skeleton/examples.json`.

## 28. Edge cases

- `lines: 1` renders one full-width line (no shortened last line).
- A circle without `height` uses its width as its height.
- `update({ width: null })` restores the default width.
- Unit-less numbers (`'10'`), negative values, exponents, and CSS functions are rejected.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SKELETON_OPTIONS` | configuration | Invalid `shape`, `lines` not an integer 1-100, or `width`/`height` not a permitted CSS length. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Only `px`, `rem`, `em`, `%`, and `ch` lengths are accepted.
- The pulse is a background-color transition, not a moving shimmer gradient.

## 31. Unsupported scenarios

- CSS functions (`calc`, `var`, `clamp`) as sizes.
- Wave or shimmer gradients.

## 32. TypeScript definitions

```ts
type SkeletonShape = 'text' | 'rect' | 'circle';
type SkeletonAnimation = 'pulse' | 'none';
interface SkeletonConfig { animation: SkeletonAnimation }
interface SkeletonOptions extends Partial<SkeletonConfig> {
  shape?: SkeletonShape;
  lines?: number;
  width?: string | null;
  height?: string | null;
}
```

## 33. Vanilla JS example

```ts
import { Skeleton } from '@absoluteui/components/skeleton';
import { Spinner } from '@absoluteui/components/spinner';
import '@absoluteui/components/skeleton/style.css';
import '@absoluteui/components/spinner/style.css';

const region = document.querySelector<HTMLElement>('#profile');
if (region) {
  const statusHost = document.createElement('div');
  const avatarHost = document.createElement('div');
  region.replaceChildren(statusHost, avatarHost);
  Skeleton.markBusy(region, true);
  const status = Spinner.create(statusHost, { label: 'Loading profile', delay: 300 });
  const avatar = Skeleton.create(avatarHost, { shape: 'circle', width: '3rem' });
  // When loaded:
  status.destroy();
  avatar.destroy();
  Skeleton.markBusy(region, false);
}
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { AuiSkeleton } from '@absoluteui/angular/skeleton';

@Component({
  selector: 'app-card',
  imports: [AuiSkeleton],
  template: `
    <section [attr.aria-busy]="loading() ? 'true' : null">
      @if (loading()) { <aui-skeleton shape="text" [lines]="3"></aui-skeleton> } @else { <p>{{ text() }}</p> }
    </section>`,
})
export class CardComponent {
  readonly loading = signal(true);
  readonly text = signal('');
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
