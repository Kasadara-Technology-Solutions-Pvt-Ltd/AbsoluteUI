# Tour

> Package: `@absoluteui/components/tour` | Styles: `@absoluteui/components/button/style.css` and `@absoluteui/components/tour/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Guides people through a screen with a sequence of steps. Each step points at an element of the page (or is centered), dims the page around it with a spotlight, and offers Next, Back, Skip, and Finish with progress such as "2 of 5". Every step is a dialog: non-modal by default, so the page stays usable, or modal on request. Focus moves into each step and returns to where it was when the tour ends. A step whose target is missing is skipped and reported with `aui-step-missing`.

## 2. Anatomy

```text
<div class="aui-tour">                                         (host, display: contents)
  <div class="aui-tour__overlay" popover="manual" aria-hidden="true">
    <div class="aui-tour__spotlight"></div>                    (cut-out; its shadow dims the page)
  </div>
  <div class="aui-tour__panel" popover="manual" role="dialog" tabindex="-1"
       aria-labelledby="...-title" aria-describedby="...-content ...-progress">
    <h2 class="aui-tour__title">Search</h2>
    <div class="aui-tour__content">Find people, documents, and pages.</div>
    <p class="aui-tour__progress">2 of 5</p>
    <div class="aui-tour__dots" aria-hidden="true"><span class="aui-tour__dot aui-tour__dot--active"></span>...</div>
    <div class="aui-tour__footer">
      <button class="aui-button aui-tour__skip">Skip tour</button>
      <div class="aui-tour__nav">
        <button class="aui-button aui-tour__back">Back</button>
        <button class="aui-button aui-tour__next">Next</button>
      </div>
    </div>
  </div>
</div>
```

## 3. When to use

- First-time guidance through a new screen or feature.
- Explaining a changed layout after a release.
- Walking through a multi-part workflow where each part is a visible control.

## 4. When not to use

- Information people need every time: put it in the interface or in help text.
- A single hint next to one control: use Popover or Tooltip.
- A blocking question: use Dialog.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element (holds the overlay and the panel). |
| `panel` | `HTMLDivElement` | The step panel (`role="dialog"`, a manual popover). |
| `options` | `Readonly<TourOptions>` | Current options. |
| `steps` | `readonly TourStep[]` | The steps. |
| `active` | `boolean` | True while a step is shown. |
| `index` | `number` | Index of the shown step, or `-1` when inactive. |
| `target` | `Element \| null` | The element the current step points at. |

Options (`TourOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `steps` | `readonly TourStep[]` | - (required) | No | `{ id, title, content?, target?, placement?, spotlightPadding?, onBeforeShow? }`. |
| `dots` | `boolean` | `false` | No | Decorative progress dots under the content. |
| `skippable` | `boolean` | `true` | No | Show the Skip button (never on the last step). |
| `keyboardNavigation` | `boolean` | `true` | No | ArrowRight and ArrowLeft move between steps on the panel and its buttons. |
| `modal` | `boolean` | `false` | Yes | Modal steps: focus is trapped and the page is blocked. |
| `closeOnEscape` | `boolean` | `true` | Yes | Escape skips the tour. |
| `showProgress` | `boolean` | `true` | Yes | Show the "2 of 5" text. |
| `spotlight` | `boolean` | `true` | Yes | Dim the page around the target. |
| `spotlightPadding` | `number` | `8` | Yes | Space between target and spotlight edge, px (0 to 64). |
| `locale` | `string` | common `locale` | Yes (common) | Locale of the labels and progress. |

A step's `target` is an `Element`, a CSS selector, a function that returns the element, or `null` (or omitted) for a centered step without a cut-out. `placement` is one of `top`, `bottom`, `left`, `right` with an optional `-start` or `-end` (default `bottom`). `onBeforeShow(step, index)` runs before the target is looked up, for example to open the menu or tab that contains it; a rejection skips the step.

## 6. Methods

| Method | Description |
|---|---|
| `Tour.create(host, options)` | Render the closed tour into `host` (children are replaced). |
| `start(index = 0)` | Start (or restart) at `index`; resolves when the first available step is shown. |
| `next()` | Next available step; on the last step, finish. |
| `back()` | Previous available step. |
| `goTo(index)` | Show the step at `index` (starts the tour when inactive). |
| `skip(reason = 'programmatic')` | End early; emits `aui-skip`. |
| `finish()` | End as completed; emits `aui-finish`. |
| `update(options)` | Merge and apply options; an active tour re-renders the current step. |
| `destroy()` | End without events; remove rendering and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-start` | `{ index }` | The first step of a tour is shown. |
| `aui-step-change` | `{ index, stepId, previousIndex, direction }` | A step is shown (`direction`: `forward`, `backward`, `jump`). |
| `aui-step-missing` | `{ index, stepId, reason }` | A step was skipped: its target is `not-found`, `hidden`, or its lookup or hook failed (`error`). |
| `aui-finish` | `{ index, completed }` | The tour reached its end; `completed` is false when it ended because no later step could be shown. |
| `aui-skip` | `{ index, stepId, reason }` | The tour was skipped (`skip-button`, `escape`, `programmatic`). |

## 8. Slots/content areas

`steps[].content`: text, or a Node the application owns (inserted as given), for example a short list or an image.

## 9. CSS parts/hooks

`aui-tour`, `aui-tour--modal`, `aui-tour--centered`, `aui-tour--no-spotlight`, `aui-tour--static`, `aui-tour__overlay`, `aui-tour__spotlight`, `aui-tour__panel`, `aui-tour__title`, `aui-tour__content`, `aui-tour__progress`, `aui-tour__dots`, `aui-tour__dot`, `aui-tour__dot--active`, `aui-tour__footer`, `aui-tour__nav`, `aui-tour__skip`, `aui-tour__back`, `aui-tour__next`, `aui-tour__finish`. The panel carries `data-placement` with the final side. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/tour/tokens.json` (verified in CI). Component tokens: `--aui-tour-bg` (`color-surface`), `--aui-tour-radius` (`radius-lg`), `--aui-tour-shadow` (`shadow-lg`), `--aui-tour-backdrop` (`color-backdrop`), `--aui-tour-spotlight-radius` (`radius-md`), `--aui-tour-spotlight-ring` (`color-focus-ring`), `--aui-tour-dot-color` (`color-border-strong`), and `--aui-tour-dot-active` (`color-primary`). Buttons use the Button tokens.

## 11. States

Inactive; active with an anchored step or a centered step; modal or non-modal; with or without spotlight; first step (no Back); last step (Finish, no Skip); with progress dots.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| inactive | `start()` / `goTo()` | first available step; `aui-start`, `aui-step-change` |
| step n | Next, ArrowRight, `next()` | next available step; `aui-step-change` |
| step n | Back, ArrowLeft, `back()` | previous available step |
| any step | a target is missing | that step is skipped; `aui-step-missing` |
| last step | Finish, `finish()` | inactive; focus restored; `aui-finish` |
| any step | Skip, Escape, `skip()` | inactive; focus restored; `aui-skip` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Step dialog | Move between buttons and content (trapped with `modal`). |
| Enter / Space | Button | Next, Back, Skip, or Finish. |
| ArrowRight / ArrowLeft | Panel or its buttons | Next and previous step (mirrored in RTL). |
| Escape | Tour active | Skip the tour and restore focus (`closeOnEscape`). |

## 14. ARIA contract

- The panel is `role="dialog"`, named by the step title (`aria-labelledby`) and described by the content and progress (`aria-describedby`); with `modal` it has `aria-modal="true"`.
- The target gets the step content in its `aria-describedby` while the step is shown; the reference is removed afterwards.
- The overlay and the progress dots are `aria-hidden="true"`.
- Buttons are native buttons.

## 15. Accessibility notes

- Focus moves to the step dialog on every step, so its title, content, and progress are announced; when the tour ends, focus returns to the element focused before `start()`.
- The non-modal default never traps keyboard users; Escape skips the tour from anywhere.
- Write step titles that make sense on their own.
- The e2e axe run covers three themes with the tour open; manual screen-reader verification is pending.

## 16. Responsive behavior

The panel is at most 24rem wide and narrower on small viewports. It flips to the opposite side and shifts to stay inside the viewport, and scrolls when taller than the available space. Targets outside the viewport are scrolled into view (centered).

## 17. RTL behavior

`-start` and `-end` placements follow the writing direction, ArrowRight and ArrowLeft are mirrored, and the button row mirrors.

## 18. Theme behavior

Text and progress colors are in the contrast gate in every theme; the spotlight ring and the current dot are checked as non-text contrast. In forced colors, shadows are not painted, so the spotlight is drawn as a `Highlight` outline and the panel border as `CanvasText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { tour: { modal: true, spotlightPadding: 4 } } });
```

## 20. Component configuration support

Instance options override configuration; changes apply to the shown step immediately.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None: the buttons are text buttons.

## 23. Security behavior

Titles and string content are set as text. Node content is inserted as given. Selectors are validated when the tour is created. Positions are written through the CSSOM (custom properties and `style.setProperty`), never as style attributes, so the tour runs under a strict CSP.

## 24. Data handling behavior

No persistence, network access, or telemetry. Store completion yourself (listen to `aui-finish` and `aui-skip`) so a tour starts only once.

## 25. Performance characteristics

Two top-layer elements are created once; a step change resolves the target, writes text, and positions the panel. Spotlight and panel follow scrolling and resizing in one animation frame. Budget: under one frame per step change without `onBeforeShow`.

## 26. Supported data scale

Up to 30 steps per tour; one active tour per page.

## 27. Usage examples

```ts
import { Tour } from '@absoluteui/components/tour';

const host = document.querySelector<HTMLElement>('#tour');
if (host) {
  const tour = Tour.create(host, {
    steps: [
      { id: 'welcome', title: 'Welcome', content: 'A short tour of your dashboard.' },
      { id: 'leave', title: 'Leave balance', content: 'Your remaining days, by type.', target: '#leave-card', placement: 'right' },
    ],
  });
  host.addEventListener('aui-finish', () => {
    host.dataset.seen = 'true';
  });
  void tour.start();
}
```

More examples, type-checked in CI: `metadata/tour/examples.json`.

## 28. Edge cases

- A step whose target is missing, hidden (`display: none`), or whose `onBeforeShow` rejects is skipped in the current direction; going back past the first available step keeps the current step.
- When no later step can be shown, the tour ends with `aui-finish` and `completed: false`; when no step can be shown at all, `start()` shows nothing and emits only `aui-step-missing`.
- Calling `start()` while active restarts without a second `aui-start`.
- `update()` that removes the current step finishes the tour.
- Step changes are cancelled when a newer one starts (slow `onBeforeShow` hooks never show an outdated step).

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TOUR_OPTIONS` | configuration | Empty steps, a duplicate or blank id, a blank title, content that is not text or a Node, an invalid target or CSS selector, an unknown placement, a spotlight padding outside 0 to 64, a non-function hook, a non-boolean flag, or an index out of range. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- One target per step; the spotlight is a rounded rectangle.
- In modal mode the spotlighted element is visible but not interactive.
- Selectors do not reach into closed shadow roots or iframes; pass a function instead.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Steps that wait for an action on the target: listen to the target and call `next()`.
- HTML strings as content: pass a Node.

## 32. TypeScript definitions

```ts
type TourTarget = Element | string | (() => Element | null) | null;
type TourDirection = 'forward' | 'backward' | 'jump';
interface TourConfig { modal: boolean; closeOnEscape: boolean; showProgress: boolean; spotlight: boolean; spotlightPadding: number }
interface TourStep {
  id: string;
  title: string;
  content?: string | Node;
  target?: TourTarget;
  placement?: Placement;
  spotlightPadding?: number;
  onBeforeShow?: (step: TourStep, index: number) => void | Promise<void>;
}
interface TourOptions extends Partial<TourConfig> {
  steps: readonly TourStep[];
  dots?: boolean;
  skippable?: boolean;
  keyboardNavigation?: boolean;
  locale?: string;
}
interface TourStartDetail { index: number }
interface TourStepChangeDetail { index: number; stepId: string; previousIndex: number | null; direction: TourDirection }
interface TourStepMissingDetail { index: number; stepId: string; reason: 'not-found' | 'hidden' | 'error' }
interface TourFinishDetail { index: number; completed: boolean }
interface TourSkipDetail { index: number; stepId: string; reason: 'skip-button' | 'escape' | 'programmatic' }
```

## 33. Vanilla JS example

```ts
import { Tour } from '@absoluteui/components/tour';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/tour/style.css';

const host = document.querySelector<HTMLElement>('#tour');
const help = document.querySelector<HTMLButtonElement>('#take-tour');
if (host && help) {
  const tour = Tour.create(host, { steps: [{ id: 'search', title: 'Search', content: 'Find anything here.', target: '#search' }] });
  help.addEventListener('click', () => {
    void tour.start();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiTour } from '@absoluteui/angular/tour';
import type { TourFinishDetail, TourStep } from '@absoluteui/components/tour';

@Component({
  selector: 'app-dashboard-tour',
  imports: [AuiButton, AuiTour],
  template: `
    <button auiButton type="button" (click)="tour.start()">Take the tour</button>
    <aui-tour #tour="auiTour" [steps]="steps" (finished)="onFinish($event)"></aui-tour>
  `,
})
export class DashboardTourComponent {
  readonly steps: TourStep[] = [
    { id: 'welcome', title: 'Welcome', content: 'A short tour of your dashboard.' },
    { id: 'search', title: 'Search', content: 'Find people and documents.', target: '#search' },
  ];
  completed = false;
  onFinish(detail: TourFinishDetail): void {
    this.completed = detail.completed;
  }
}
```

## 35. React example

```tsx
import { AuiTour } from '@absoluteui/react/tour';

const steps = [{ id: 'welcome', title: 'Welcome', content: 'A short tour of your dashboard.' }];

export function Example() {
  return <AuiTour steps={steps} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiTour } from '@absoluteui/vue/tour';

const steps = [{ id: 'welcome', title: 'Welcome', content: 'A short tour of your dashboard.' }];
</script>

<template>
  <AuiTour :steps="steps" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
