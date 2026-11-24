# Stepper

> Package: `@absoluteui/components/stepper` | Styles: `@absoluteui/components/stepper/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

Show progress through a multi-step flow and let users move between steps. `Stepper` renders navigation: a labelled `<nav>` with an ordered list of steps. Reachable steps are links (when they have an `href`) or buttons; the current step carries `aria-current="step"`; unreachable steps are text. In linear mode, a step after the current one is reachable only when every step before it is complete. Activation emits a cancelable `aui-navigate`, so the application can guard the move, and then `aui-change`, so it can switch its own panels. Step status (`complete`, `error`) is data owned by the application; the stepper never infers completion.

## 2. Anatomy

```text
<div class="aui-stepper aui-stepper--horizontal">                     (consumer host; inline-size container)
  <nav class="aui-stepper__nav" aria-label="Checkout progress">
    <ol class="aui-stepper__list">
      <li class="aui-stepper__step" data-state="complete" data-reachable="true">
        <button type="button" class="aui-stepper__control" data-index="0">   (<a href> when the step has an href)
          <span class="aui-stepper__indicator" aria-hidden="true"><svg class="aui-icon">...</svg></span>
          <span class="aui-stepper__text">
            <span class="aui-stepper__label">Cart</span>
            <span class="aui-stepper__optional">Optional</span>            (optional: true)
            <span class="aui-stepper__description">...</span>              (description)
          </span>
          <span class="aui-stepper__status">Completed</span>               (visually hidden; "Error" for errors)
        </button>
      </li>
      <li class="aui-stepper__step" data-state="current">
        <span class="aui-stepper__control" aria-current="step">...<span class="aui-stepper__indicator" aria-hidden="true">2</span>...</span>
      </li>
      <li class="aui-stepper__step" data-state="upcoming">
        <span class="aui-stepper__control">...</span>                        (unreachable: text)
      </li>
    </ol>
  </nav>
</div>
```

The connector line between steps is a decorative `::after` on `.aui-stepper__step`.

## 3. When to use

- Multi-step flows with a known, short sequence, such as checkout, onboarding, or a setup wizard.
- Showing which steps are complete, which is current, and which are still ahead.
- Letting users return to earlier steps, and in non-linear flows jump ahead.

## 4. When not to use

- Peer views without an order: use Tabs.
- Position in a page hierarchy: use Breadcrumb.
- Progress of a single task: use Progress Bar.
- Flows with more than about 7 steps or with branches: split the flow.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `nav` | `HTMLElement` | The `<nav>` landmark. |
| `value` | `string` | Current step id. |
| `options` | `Readonly<StepperOptions>` | Current options. |

| Option | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | required | Accessible name of the `<nav>`. Must not be empty. |
| `steps` | `readonly StepperStep[]` | required | At least one step. Ids unique and non-empty; labels non-empty. |
| `value` | `string` | first step's id | Current step id; must exist in `steps`. |
| `icons` | `Partial<StepperIcons>` | - | Indicator icon overrides. |

| Global option | Type | Default |
|---|---|---|
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` |
| `linear` | `boolean` | `true` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

Full table: `metadata/stepper/api.json`.

## 6. Methods

| Method | Description |
|---|---|
| `Stepper.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before touching the host. |
| `state(id)` | `'current' \| 'complete' \| 'error' \| 'upcoming'`, or `null` for an unknown id. The current step is always `'current'`, whatever its `status`. |
| `isReachable(id)` | Whether the user can activate the step now. `false` for the current step, disabled steps, and unknown ids. |
| `select(id)` | Make a step current. No events and no reachability check. Throws `STEPPER_OPTIONS` for an unknown id. |
| `update(options)` | Merge, validate, and apply options. When the current id no longer exists and no `value` is given, the first step becomes current. No events. A failed update keeps the previous state. |
| `destroy()` | Remove rendering, host classes, the click listener, and the configuration subscription. |

## 7. Events

Dispatched on the host.

| Event | Detail | Bubbles | Cancelable | Description |
|---|---|---|---|---|
| `aui-navigate` | `{ id, index, step, previous }` | Yes | Yes | The user activated a reachable step. `previous` is the current id before the move. `preventDefault()` keeps the current step and, for link steps, stops native navigation. |
| `aui-change` | `{ value, previous }` | Yes | No | The current step changed after an uncanceled `aui-navigate`. |

Modified clicks on link steps (Ctrl, Meta, Shift, Alt, or a non-primary button) keep native behavior, such as opening a new tab, and are not reported. `select()` and `update()` never emit events.

## 8. Slots/content areas

None. Labels, descriptions, and the "Optional" hint are text. The stepper does not render step panels; show them from `aui-change`.

## 9. CSS parts/hooks

| Class / attribute | Purpose |
|---|---|
| `aui-stepper` | Host; `container-type: inline-size`. |
| `aui-stepper--horizontal`, `--vertical` | Configured orientation. |
| `aui-stepper__nav` | The `<nav>`. |
| `aui-stepper__list` | The `<ol>`. |
| `aui-stepper__step` | `<li>`; `data-state` = `current \| complete \| error \| upcoming`; `data-reachable="true"`; `data-disabled="true"`. |
| `aui-stepper__control` | `<a>`, `<button>`, or `<span>`. |
| `aui-stepper__indicator` | Number or icon circle (`aria-hidden`). |
| `aui-stepper__text`, `__label`, `__optional`, `__description` | Text parts. |
| `aui-stepper__status` | Visually hidden status text. |

All rules live in the `aui.components` cascade layer. The `--vertical` class reflects the option only; the container-query switch to the vertical layout does not change the class.

## 10. Design tokens

See `metadata/stepper/tokens.json` (24 tokens, verified against the stylesheet in CI). Key tokens: `color-primary`, `color-on-primary`, `color-border-strong`, `color-error-fg`, `color-text-muted`, `control-height-sm` (indicator size), `border-width-strong` (connector), `radius-pill`, `space-1|2|4`.

## 11. States

Step states: upcoming, current, complete, error. Modifiers: optional, disabled, reachable, unreachable. Interaction: hover (label underline on reachable steps), focus-visible. Layout: horizontal, vertical.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| step A current | reachable step B activated | `aui-navigate`; unless prevented, B current and `aui-change` |
| step A current | `aui-navigate` prevented | A stays current; a link step does not navigate |
| any | `select(id)` | `id` current, no events |
| any | `update({ steps })` with new statuses | reachability recomputed |
| any | `update({ steps })` without the current id | first step current, no events |
| horizontal | container 30rem or narrower | vertical layout (class unchanged) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves between reachable steps. The current step and unreachable steps are not Tab stops. |
| Enter | Reachable step focused | `aui-navigate`, then (unless prevented) the step becomes current and `aui-change`. Link steps then navigate natively. |
| Space | Reachable button step focused | Same as Enter. |

There is no arrow-key navigation between steps.

## 14. ARIA contract

- `<nav aria-label>` landmark named by the `label` option.
- `<ol>` of `<li>` steps, so position and count are announced.
- The current step's control has `aria-current="step"`.
- Reachable steps are native `<a href>` or `<button type="button">`; the current and unreachable steps are `<span>` text.
- Indicators are `aria-hidden="true"`; complete and error steps contain visually hidden "Completed" / "Error" text.
- `direction: 'rtl'` sets `dir="rtl"` on the `<nav>`.

## 15. Accessibility notes

- Status is never conveyed by color or icon alone (WCAG 1.4.1): hidden status text plus a visible "Optional" hint.
- After a button step is activated, focus moves to the new current step (`tabindex="-1"`), because the activated button is re-rendered as text.
- Unreachable steps are text without an explanation; describe the rule near the stepper (for example "Complete this step to continue") when it is not obvious.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The host is a size container. A horizontal stepper uses the vertical layout when its own container is 30rem wide or narrower (`@container (max-width: 30rem)`), independent of the viewport. Labels and descriptions wrap and break anywhere. Horizontal steps share the width equally.

## 17. RTL behavior

Logical properties throughout: horizontal steps and connectors follow the inline direction, and the vertical connector runs along the inline-start edge. `direction: 'rtl'` sets `dir="rtl"` on the `<nav>`; with `'ltr'` (default) no `dir` is set, so an ancestor `dir="rtl"` also applies. Icons are not mirrored.

## 18. Theme behavior

Role tokens only. Current: primary-colored indicator border and number, semibold label. Complete: filled primary indicator with a check, primary connector to the next step. Error: error-foreground indicator with an alert icon. Disabled: disabled text color. Forced-colors mode: `CanvasText` indicators and connectors, `Highlight` complete indicator, `GrayText` disabled steps.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { stepper: { orientation: 'vertical', linear: false } } });
```

Changes apply to existing instances immediately (the list is re-rendered).

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic through `update()`.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

| Slot | Default | Used for |
|---|---|---|
| `icons.complete` | `check` | Complete step indicator. |
| `icons.error` | `alert-circle` | Error step indicator. |

Upcoming and current steps show their 1-based number. Icons resolve through the global icon provider/registry.

## 23. Security behavior

Labels and descriptions use `textContent`. Each `href` is parsed with the URL standard against `document.baseURI`; only `http:`/`https:` and scheme-less URLs (relative, path-absolute, query, fragment) are accepted. `javascript:`, `data:`, and other schemes, including obfuscations such as `java\tscript:`, throw `STEPPER_OPTIONS`; the error names the property but never echoes the value. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. `status` is consumer data; the stepper reads it and never changes it.

## 25. Performance characteristics

One click listener on the list and one configuration subscription per instance. Every change rebuilds the step list (O(steps)); focus is restored to the same step. Budget: `Stepper.create` with 10 steps under 5 ms in headless Chromium.

## 26. Supported data scale

Designed for 2-7 steps; any count renders, but horizontal steps share the width, so long flows switch to the vertical layout early. Tested with 4-step flows.

## 27. Usage examples

```ts
import { Stepper } from '@absoluteui/components/stepper';

const host = document.createElement('div');
document.body.append(host);
Stepper.create(host, {
  label: 'Checkout progress',
  steps: [
    { id: 'cart', label: 'Cart', status: 'complete' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'payment', label: 'Payment' },
  ],
  value: 'shipping',
});
```

More examples, type-checked in CI: `metadata/stepper/examples.json`.

## 28. Edge cases

- Linear rule: a step after the current one is reachable only when every step before it, including the current step, has `status: 'complete'`. An `'error'` step blocks forward reach past it.
- Earlier steps are always reachable unless disabled, in both modes.
- The current step is shown as current even when its `status` is set; its status text is not rendered.
- A disabled step can still be current (through `value`, the default first step, or `select()`).
- `select()` and `update({ value })` bypass reachability.
- A single-step stepper has no reachable steps.
- A current or unreachable step with an `href` renders as text, not as a link.
- `optional` shows a hint only; it does not change reachability.
- Re-renders (`update()`, configuration changes) rebuild the list but keep focus on the same step; a step that became current or unreachable is focused as text (`tabindex="-1"`).

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `STEPPER_OPTIONS` | configuration | Empty `label`; empty `steps`; an empty or duplicate step `id`; an empty step `label`; `status` other than `'complete'`/`'error'`; an unsafe or unparsable `href`; `value` (or `select(id)`) not matching a step. `property` is `stepper.<name>`, for example `stepper.steps.href`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `orientation`, `linear`, or `direction` (instance or global configuration). |

A failed construction leaves the host untouched: no children, classes, listeners, or subscriptions. A failed `update()` keeps the previous options and rendering.

## 30. Known limitations

- The list is rebuilt on every change; focus inside the stepper is not restored after `update()` or a configuration change.
- After a link step is activated without `preventDefault()`, focus is not moved (the page is expected to navigate).
- The horizontal-to-vertical switch is fixed at a 30rem container width.
- No arrow-key navigation.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML or custom nodes in labels and descriptions.
- Hrefs with schemes other than http and https.
- Branching or nested steps.
- Automatic completion tracking.

## 32. TypeScript definitions

```ts
type StepperOrientation = 'horizontal' | 'vertical';
type StepperStepStatus = 'complete' | 'error';
type StepperStepState = 'complete' | 'error' | 'current' | 'upcoming';
interface StepperConfig { orientation: StepperOrientation; linear: boolean }
interface StepperStep { id: string; label: string; description?: string; href?: string; status?: StepperStepStatus; optional?: boolean; disabled?: boolean }
interface StepperIcons { complete: IconRef; error: IconRef }
interface StepperOptions extends Partial<StepperConfig> { label: string; steps: readonly StepperStep[]; value?: string; direction?: Direction; icons?: Partial<StepperIcons> }
interface StepperNavigateDetail { id: string; index: number; step: StepperStep; previous: string }
interface StepperChangeDetail { value: string; previous: string }
```

## 33. Vanilla JS example

```ts
import { Stepper, type StepperChangeDetail, type StepperNavigateDetail } from '@absoluteui/components/stepper';
import '@absoluteui/components/stepper/style.css';

const host = document.querySelector<HTMLElement>('#checkout-steps');
const form = document.querySelector<HTMLFormElement>('#checkout');
if (host && form) {
  const steps = [
    { id: 'shipping', label: 'Shipping' },
    { id: 'payment', label: 'Payment' },
    { id: 'review', label: 'Review' },
  ];
  Stepper.create(host, { label: 'Checkout progress', steps, linear: false });
  host.addEventListener('aui-navigate', (event) => {
    const { index, previous } = (event as CustomEvent<StepperNavigateDetail>).detail;
    const from = steps.findIndex((s) => s.id === previous);
    if (index > from && !form.reportValidity()) event.preventDefault();
  });
  host.addEventListener('aui-change', (event) => {
    form.dataset.step = (event as CustomEvent<StepperChangeDetail>).detail.value;
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { StepperNavigateDetail, StepperStep } from '@absoluteui/components/stepper';
import { AuiStepper } from '@absoluteui/angular/stepper';

@Component({
  selector: 'app-checkout-steps',
  imports: [AuiStepper],
  template: `<aui-stepper label="Checkout" [steps]="steps" [value]="current" (changed)="current = $event.value" (aui-navigate)="guard($event)"></aui-stepper>`,
})
export class CheckoutStepsComponent {
  current = 'cart';
  readonly steps: StepperStep[] = [
    { id: 'cart', label: 'Cart', status: 'complete' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'payment', label: 'Payment' },
  ];

  guard(event: Event): void {
    const { id } = (event as CustomEvent<StepperNavigateDetail>).detail;
    if (id === 'payment' && !this.shippingValid()) event.preventDefault();
  }

  private shippingValid(): boolean {
    return true;
  }
}
```

`<aui-stepper>` is generated; inputs mirror the options, `[(value)]` is two-way, outputs are `navigate` and `changed`. Outputs carry only the event `detail`, so a guard that calls `preventDefault()` must bind the DOM event `(aui-navigate)` as shown.

## 35. React example

```tsx
import { AuiStepper } from '@absoluteui/react/stepper';

const steps = [{ id: 'cart', label: 'Cart', status: 'complete' as const }, { id: 'shipping', label: 'Shipping' }, { id: 'payment', label: 'Payment' }];

export function Example() {
  return <AuiStepper label="Checkout" steps={steps} value="shipping" />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiStepper } from '@absoluteui/vue/stepper';
const steps = [{ id: 'cart', label: 'Cart', status: 'complete' as const }, { id: 'shipping', label: 'Shipping' }, { id: 'payment', label: 'Payment' }];
</script>

<template>
  <AuiStepper label="Checkout" :steps="steps" value="shipping" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
