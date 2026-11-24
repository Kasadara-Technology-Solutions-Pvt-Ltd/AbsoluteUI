# Button

> Package: `@absoluteui/components/button` | Styles: `@absoluteui/components/button/style.css` | Since 0.1.0 | Status: R0 reference component

## 1. Purpose

Triggers an action. `Button` enhances a native `<button>`; semantics, form submission, and keyboard activation stay native. Since 0.9.0 it also enhances a link (`<a href>`) that should look like a button; the element stays a link.

## 2. Anatomy

```text
<button class="aui-button aui-button--{variant} aui-button--{size}">
  [svg.aui-icon.aui-button__icon]   (optional, start or end)
  label text
  [span visually hidden ", Loading"] (loading only)
</button>
```

## 3. When to use

- Submitting forms and triggering in-page actions.
- Icon-only actions that have an accessible name.
- Actions with a busy state while an operation is pending.

## 4. When not to use

- Plain navigation inside text: use an unstyled link. A link that must look like a button is enhanced as a link (`Button.enhance(anchor)`), never replaced by a `<button>`.
- Persistent on/off state: use Switch.
- Choosing one of several options: use a segmented control or radio group.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `E` (`HTMLButtonElement` or `HTMLAnchorElement`) | The enhanced native button or link. |
| `options` | `Readonly<ButtonOptions>` | Current instance options. |

Options (`ButtonOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'danger'` | `'secondary'` | Yes | Visual emphasis (`outline` since 0.9.0). |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Yes | Height and font size. |
| `loading` | `boolean` | `false` | No | Busy state. |
| `icon` | `IconRef \| null` | `null` | No | Icon name or definition. |
| `iconPosition` | `'start' \| 'end'` | `'start'` | No | Logical icon placement. |
| `fullWidth` | `boolean` | `false` | No | Stretch to the full inline size of the container (since 0.9.0). |
| `disabled` | `boolean` | - | No | Since 0.9.0. Links: `aria-disabled="true"`, removed from the tab order, activation blocked, href kept. Buttons: sets the native `disabled` property; unset leaves it alone. |
| `label` | `string` | - | No | Accessible name; required for icon-only buttons. |
| `icons` | `Partial<{ loading: IconRef }>` | - | No | Icon slot overrides. |
| `pressed` | `boolean | null` | - | No | Toggle button (since 0.9.0): a boolean sets `aria-pressed` and flips on each activation; `null` or unset is an ordinary button. Buttons only, not links. |

## 6. Methods

| Method | Description |
|---|---|
| `Button.enhance(element, options?)` | Enhance an existing native button or link. Throws if `element` is neither a `<button>` nor an `<a>`. |
| `Button.create(options?, doc?)` | Create a native button; `text` is set via `textContent`; `type` defaults to `'button'`. |
| `update(options)` | Merge and apply options. |
| `setLoading(loading)` | Toggle the busy state. |
| `destroy()` | Remove classes, icons, listeners, and configuration subscriptions. |

## 7. Events

Use the native `click` event; it is suppressed while loading.

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ pressed: boolean }` (`ButtonChangeDetail`) | A toggle button (`pressed` set) was activated by the user. Programmatic changes do not emit. |

## 8. Slots/content areas

The button's own child content is the label. AbsoluteUI adds the icon and loading text around it and never replaces it.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-button` | Base class; works without JavaScript. |
| `aui-button--primary`, `--secondary`, `--outline`, `--ghost`, `--danger` | Variants. |
| `aui-button--full-width` | Full inline size (`fullWidth`). |
| `aui-button--sm`, `--md`, `--lg` | Sizes. |
| `aui-button--icon-only` | Square icon-only layout. |
| `aui-button__icon`, `aui-button__spinner` | Icon and loading spinner. |
| `[data-loading]` | Present while loading. |

All rules live in the `aui.components` cascade layer; unlayered consumer CSS overrides them without `!important`.

## 10. Design tokens

See `metadata/button/tokens.json` (38 tokens, verified against the stylesheet in CI). Key tokens: `color-primary*`, `color-on-primary`, `color-danger-fill*`, `color-on-danger`, `color-surface`, `color-border-strong`, `color-focus-ring`, `control-height-*`, `control-padding-x`, `radius-md`, `duration-fast`, `easing-standard`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-button-radius` (button corner radius; falls back to `radius-md`), `--aui-button-height` (medium button height (and icon-only width); falls back to `control-height-md`), `--aui-button-padding-x` (medium button inline padding; falls back to `control-padding-x`), `--aui-button-font-weight` (label weight; falls back to `font-weight-medium`), `--aui-button-bg` (default button background; falls back to `color-surface`), `--aui-button-fg` (default button label; falls back to `color-text`), `--aui-button-border-color` (default button boundary; falls back to `color-border-strong`), `--aui-button-primary-bg` (primary button background and boundary; falls back to `color-primary`), `--aui-button-primary-fg` (primary button label; falls back to `color-on-primary`).

## 11. States

default, hover, active, focus-visible, disabled (native `disabled`; `disabled` option on links), loading, pressed (toggle buttons: `aui-button--pressed`).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| default | `setLoading(true)` / `update({ loading: true })` | loading (activation blocked, stays focusable) |
| loading | `setLoading(false)` | default |
| any | native `disabled = true` | disabled (removed from tab order by the browser) |
| any (link) | `update({ disabled: true })` | disabled (`aria-disabled`, `tabindex="-1"`, activation blocked; the previous `tabindex` returns on enable) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter | Focused | Activates (native). Blocked while loading. |
| Space | Focused | Activates on release (native). Blocked while loading. |
| Tab / Shift+Tab | Any | Moves focus; loading buttons stay in the tab order. |

## 14. ARIA contract

- Native `button` role; a link host keeps the native `link` role (it navigates, so it is announced as a link).
- `aria-disabled="true"` while loading, and on a disabled link.
- Toggle buttons: `aria-pressed="true|false"` (WAI-ARIA button pattern). Keep the label the same in both states; `aria-pressed` announces the state.
- `aria-label` set from `label`; while loading it becomes `"{label}, Loading"`.
- Icons are `aria-hidden="true"` and `focusable="false"`.

## 15. Accessibility notes

- Loading is conveyed through the accessible name because `aria-busy` is not reliably announced on buttons.
- Icon-only buttons without an accessible name are rejected at construction (`BUTTON_ICON_ONLY_LABEL`).
- Minimum target size is 1.5rem (WCAG 2.5.8); compact `sm` buttons are 1.75rem high.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Inline-flex; the label does not wrap. Density tokens (`compact`, `comfortable`, `spacious`) change control height and padding.

## 17. RTL behavior

Logical properties throughout; `iconPosition: 'start'` places the icon at the inline start in both directions.

## 18. Theme behavior

Colors come from role tokens only. Verified in light, dark, and high-contrast themes (axe, WCAG 2.2 AA). In forced-colors mode, borders use `ButtonText`, disabled uses `GrayText`, and focus uses `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { button: { variant: 'primary', size: 'sm' } } });
```

Global changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icon` accepts a name resolved through the global icon provider/registry or an inline `IconDefinition`. The `icons.loading` slot defaults to `spinner`.

## 23. Security behavior

`Button.create` sets text with `textContent`, so HTML strings are never parsed. No inline styles, `eval`, or injected `<style>`; verified under a strict CSP with Trusted Types enforced.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

One capture-phase click listener and one configuration subscription per instance. Budget: under 0.5 ms average per `Button.enhance` across 1,000 instances in headless Chromium (performance test).

## 26. Supported data scale

1,000 buttons per page in the performance test.

## 27. Usage examples

```ts
import { Button } from '@absoluteui/components/button';

const el = document.querySelector<HTMLButtonElement>('#save');
if (el) {
  const save = Button.enhance(el, { variant: 'primary' });
  el.addEventListener('click', () => {
    save.setLoading(true);
  });
}
```

More examples, type-checked in CI: `metadata/button/examples.json`.

## 28. Edge cases

- Enhancing a button whose only child is an icon requires `label`, `aria-label`, or `aria-labelledby`.
- A `type="submit"` button does not submit its form while loading.
- A link host without `href` is not a link (no role, not focusable); give it an `href`.
- A disabled or loading link blocks click handlers registered after enhancement, including router link handlers on the same element; modified clicks are blocked too.
- Calling `update({ variant })` with an invalid value throws, and the previous rendering stays in place.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BUTTON_HOST` | configuration | Host is neither a `<button>` nor an `<a>`. |
| `BUTTON_ICON_ONLY_LABEL` | configuration | Icon-only button without an accessible name. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown option; the message names the property and expected type, never the value. |

A failed construction leaves no listeners or subscriptions behind.

## 30. Known limitations

- Capture-phase click listeners that a consumer registers on the same element *before* enhancement still run while loading.
- Screen-reader behavior of the loading name change has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Hosts other than `<button>` and `<a>` (for example a `div` with `role="button"`).
- HTML strings as labels.

## 32. TypeScript definitions

```ts
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconRef | null;
  iconPosition?: 'start' | 'end';
  fullWidth?: boolean;
  disabled?: boolean;
  label?: string;
  icons?: Partial<{ loading: IconRef }>;
}
```

## 33. Vanilla JS example

```ts
import { Button } from '@absoluteui/components/button';
import '@absoluteui/components/button/style.css';

const b = Button.create({ text: 'Save', variant: 'primary', type: 'submit' });
document.querySelector('form')?.append(b.element);
```

## 34. Angular example

`button[auiButton]` enhances the native `<button>` in place (`Button.enhance`); its content stays Angular-managed. `a[auiButton]` (`AuiLinkButton`) does the same for links, including `routerLink`, with a `disabled` input for links (see docs/ANGULAR.md).

```ts
import { Component, signal } from '@angular/core';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-save-bar',
  imports: [AuiButton],
  template: `
    <button type="button" auiButton variant="secondary" (click)="cancel()">Cancel</button>
    <button type="button" auiButton variant="primary" [loading]="saving()" (click)="save()">Save changes</button>`,
})
export class SaveBarComponent {
  readonly saving = signal(false);
  cancel(): void {}
  save(): void {
    this.saving.set(true);
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. AbsoluteUI components are framework-neutral controller classes that render light DOM (SPEC section 4.4). Custom-element wrappers are not shipped. The CSS classes do work declaratively: `<button class="aui-button aui-button--primary">Save</button>`.
