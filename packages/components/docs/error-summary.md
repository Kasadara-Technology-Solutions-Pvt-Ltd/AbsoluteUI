# Error Summary

> Package: `@absoluteui/components/error-summary` | Styles: `@absoluteui/components/error-summary/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Accessible error navigation (SPEC section 18.8). `ErrorSummary` lists every error after a failed submission as links that move focus to the offending field, following the GOV.UK error summary pattern. The summary is a labelled region that receives focus when shown, so screen readers announce its heading and contents once, without a live region. Form creates and fills one automatically; it can also be used on its own, for example for server-rendered errors.

## 2. Anatomy

```text
<div class="aui-error-summary" role="region" aria-labelledby=title tabindex="-1" hidden>   (consumer host)
  <h2 class="aui-error-summary__title" id=title>
    <svg class="aui-error-summary__icon aui-icon" aria-hidden="true"><span>There is a problem</span>
  </h2>
  <p class="aui-error-summary__description">                    (optional)
  <ul class="aui-error-summary__list">
    <li><a class="aui-error-summary__link" href="#field-id">Message</a></li>   (item with target)
    <li>Message</li>                                                           (item without target)
  </ul>
</div>
```

## 3. When to use

- After a failed form submission, to list all errors at the top of the form with links to each field.
- Server-side errors shown after a full page load, including errors that belong to no field.

## 4. When not to use

- Inline messages next to a field: controls render those; for other controls use Validation Message.
- Non-error notices or confirmations: use an alert or toast.
- Forms managed by Form: it creates and fills the summary itself (use Form's `summaryHost` to place it).

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; becomes the summary region. |
| `items` | `readonly ErrorSummaryItem[]` | Items currently shown. |
| `isVisible` | `boolean` | `true` while items are shown. |

Options: `title`, `description`, and `icons`. Full table: `metadata/error-summary/api.json`.

| Global option | Type | Default |
|---|---|---|
| `headingLevel` | `2 \| 3 \| 4` | `2` |
| `focusOnShow` | `boolean` | `true` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `ErrorSummary.create(host, options?)` | Render into `host` (children are replaced). Hidden until `show()`. |
| `show(items, { focus }?)` | Replace the items and show the summary; an empty list hides it. Focuses and scrolls to the summary unless `focus: false` or `focusOnShow` is `false`. |
| `clear()` | Remove all items and hide the summary without moving focus. |
| `update(options)` | Merge options and re-render the heading and description. |
| `destroy()` | Remove rendering, attributes, class, and the configuration subscription; unhide the host. |

Each `ErrorSummaryItem` is `{ message, target?, focus? }`. With a `target` the message becomes a link to `#target.id` (an id is generated if missing); `focus` replaces the default `target.focus()`, for example to focus a component's inner input. Without a `target` the message is plain list text.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-navigate` | `{ index, message }` | Yes | A link was activated and focus moved to its target. |

## 8. Slots/content areas

None. Items, heading, and description are text.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-error-summary` | Host region. |
| `aui-error-summary__title` | Heading (`h2`, `h3`, or `h4`). |
| `aui-error-summary__icon` | Heading icon. |
| `aui-error-summary__description` | Optional text under the heading. |
| `aui-error-summary__list` | Error list. |
| `aui-error-summary__link` | Link to a field. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/error-summary/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-error-subtle`, `color-error-fg`, `border-width-strong`, `font-weight-semibold`, `radius-md`, `space-4`.

## 11. States

hidden, visible, focused (`:focus-visible` ring), link hover (thicker underline), link focus-visible.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| hidden | `show(items)` with items | visible; focused unless disabled |
| visible | `show(items)` | items replaced; focused again unless disabled |
| visible | `show([])` or `clear()` | hidden; focus unchanged |
| visible | link activated | focus on target; `aui-navigate` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Summary or link focused | Moves between links and the rest of the page. |
| Enter | Link focused | Focuses the target (or calls its `focus` callback), scrolls it to the center, emits `aui-navigate`. |

## 14. ARIA contract

- Host: `role="region"`, `aria-labelledby` pointing at the heading, `tabindex="-1"`.
- Native heading of the configured level; the icon is `aria-hidden`.
- Native `<ul>` of native `<a href="#id">` links.

## 15. Accessibility notes

- Focus moves to the summary when shown, so its name and contents are read once; no live region is used.
- Link activation prevents the fragment navigation: the URL hash does not change and focus lands on the control itself.
- Links are underlined and error-colored; color is not the only cue (WCAG 1.4.1).
- Choose `headingLevel` to fit the page's heading outline.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Block-level grid filling its container; long messages wrap.

## 17. RTL behavior

Logical properties: the thick border sits on the inline-start side and the list indents from the inline start.

## 18. Theme behavior

Error-subtle background with error-foreground border, heading, and links, from role tokens only. Forced-colors mode uses `CanvasText` for the border and `LinkText` for links.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { errorSummary: { headingLevel: 3 } } });
```

Changes apply to existing instances immediately. Form passes `focus` explicitly (from its `focusOnInvalid` option), so `focusOnShow` does not affect Form-owned summaries.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`), shown in the heading.

## 23. Security behavior

Heading, description, and messages use `textContent` and are never parsed as HTML. Link `href`s are only `#id` fragments of the targets. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

One configuration subscription and one click listener per link. `show()` rebuilds the list. No dedicated performance budget.

## 26. Supported data scale

Unit tests cover up to four items. A summary is meant for the errors of one form; dozens of items render without issue but become hard to use.

## 27. Usage examples

```ts
import { ErrorSummary } from '@absoluteui/components/error-summary';

const summaryHost = document.createElement('div');
const name = document.createElement('input');
name.id = 'full-name';
document.body.append(summaryHost, name);
ErrorSummary.create(summaryHost).show([{ message: 'Enter your full name', target: name }]);
```

More examples, type-checked in CI: `metadata/error-summary/examples.json`.

## 28. Edge cases

- An item with an empty or non-string `message` throws `ERROR_SUMMARY_ITEM` before anything changes.
- A target without an id receives a generated one.
- `show([])` hides the summary and never moves focus.
- Calling `show()` again while visible re-focuses the summary (unless `focus: false`).

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `ERROR_SUMMARY_ITEM` | configuration | An item's `message` is empty or not a string. |
| `CFG_INVALID_VALUE` | configuration | `headingLevel` is not 2, 3, or 4, or `focusOnShow` is not a boolean. |

Invalid options at construction throw before rendering; in `update()` they leave the previous options in place.

## 30. Known limitations

- A target without an id is modified (an id is generated).
- Without script, the `#id` link only scrolls; focus lands on the target only if it is focusable.
- Heading levels are limited to 2, 3, and 4.
- Announcement on focus has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML or custom content in items.
- Item actions other than navigation.

## 32. TypeScript definitions

```ts
type HeadingLevel = 2 | 3 | 4;
interface ErrorSummaryItem { readonly message: string; readonly target?: HTMLElement | null; readonly focus?: () => void }
interface ErrorSummaryIcons { error: IconRef }
interface ErrorSummaryOptions { title?: string; description?: string; headingLevel?: HeadingLevel; focusOnShow?: boolean; locale?: string; icons?: Partial<ErrorSummaryIcons> }
interface ErrorSummaryNavigateDetail { index: number; message: string }
```

## 33. Vanilla JS example

```ts
import { ErrorSummary } from '@absoluteui/components/error-summary';
import '@absoluteui/components/error-summary/style.css';

// Errors rendered by the server into data attributes on each invalid input.
const host = document.querySelector<HTMLElement>('#error-summary');
if (host) {
  const invalid = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-error]'));
  const summary = ErrorSummary.create(host);
  summary.show(invalid.map((input) => ({ message: input.dataset.error ?? '', target: input })).filter((item) => item.message !== ''));
}
```

## 34. Angular example

Inside `form[auiForm]` the form renders its own summary. For errors outside a form (for example a failed server request), place the directive and call `show()` on its controller. `controller` is `null` until the first browser render.

```ts
import { Component, viewChild } from '@angular/core';
import { AuiErrorSummary } from '@absoluteui/angular/error-summary';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-booking-errors',
  imports: [AuiErrorSummary, AuiButton],
  template: `
    <aui-error-summary title="The booking was not saved" [headingLevel]="2"></aui-error-summary>
    <button type="button" auiButton variant="primary" (click)="showServerError()">Save booking</button>`,
})
export class BookingErrorsComponent {
  private readonly summary = viewChild.required(AuiErrorSummary);

  showServerError(): void {
    this.summary().show([{ message: 'The service is busy. Try again in a few minutes.' }]);
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
