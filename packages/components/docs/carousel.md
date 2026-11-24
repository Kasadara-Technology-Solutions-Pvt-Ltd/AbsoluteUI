# Carousel

> Package: `@absoluteui/components/carousel` | Styles: `@absoluteui/components/button/style.css` and `@absoluteui/components/carousel/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

Shows one slide at a time from a set, such as featured items, an onboarding tour, or images, following the WAI-ARIA APG carousel pattern. The carousel is a named region with the role description "carousel"; each slide is a group labelled "N of M"; previous, next, and slide picker buttons move between slides; and slides that are not shown are inert, so focus never lands in a hidden slide. Autoplay is off by default. When it is on, a pause button comes first, rotation pauses on hover and focus, and it does not start for users who prefer reduced motion.

## 2. Anatomy

```text
<section class="aui-carousel" role="region" aria-roledescription="carousel" aria-label="Featured">
  <button class="aui-carousel__pause">Pause</button>                          (autoplay only)
  <div class="aui-carousel__viewport" aria-live="polite|off">
    <div class="aui-carousel__track">
      <div class="aui-carousel__slide" role="group" aria-roledescription="slide" aria-label="1 of 3: Spring sale">content</div>
      <div class="aui-carousel__slide" ... inert>...</div>
    </div>
  </div>
  <div class="aui-carousel__controls">
    <button class="aui-carousel__prev" aria-label="Previous slide"></button>
    <div class="aui-carousel__picker" role="group" aria-label="Slides"><button class="aui-carousel__dot" aria-label="Go to slide 1" aria-current="true"></button> ...</div>
    <button class="aui-carousel__next" aria-label="Next slide"></button>
  </div>
</section>
```

## 3. When to use

- A few related items of equal weight that do not all need to be visible at once.
- A short step-through such as an onboarding tour.

## 4. When not to use

- Important content every user must see: most users never see slides after the first.
- Many items: use a list or a grid.
- Navigation between views: use Tabs.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element (`role="region"`). |
| `index` | `number` | Current slide (0-based). |
| `rotating` | `boolean` | Whether automatic rotation is running now. |
| `options` | `Readonly<CarouselOptions>` | Current options. |

Options (`CarouselOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the carousel. |
| `slides` | `readonly CarouselSlide[]` | - (required) | No | `{ content: Node \| string, label? }`; 1 to 100 slides. |
| `index` | `number` | `0` | No | Current slide (0-based). |
| `loop` | `boolean` | `false` | No | Wrap from the last slide to the first and back. |
| `autoplay` | `number \| null` | `null` | No | Rotation interval in milliseconds (at least 2000). |
| `showPicker` | `boolean` | `true` | Yes | Show the slide picker buttons. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the control labels and slide positions. |

## 6. Methods

| Method | Description |
|---|---|
| `Carousel.create(host, options)` | Render into `host` (children are replaced). |
| `goTo(index)` / `next()` / `previous()` | Change the slide programmatically (no event); clamped, or wrapped with `loop`. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Stop rotation and remove rendering, attributes, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ index: number }` | The user moved to another slide (buttons or a swipe). Rotation and programmatic changes do not emit. |

## 8. Slots/content areas

`slides[].content`: a `Node` or text per slide.

## 9. CSS parts/hooks

`aui-carousel`, `aui-carousel--autoplay`, `aui-carousel--animated`, `aui-carousel__pause`, `aui-carousel__viewport`, `aui-carousel__track`, `aui-carousel__slide`, `aui-carousel__slide--current`, `aui-carousel__controls`, `aui-carousel__prev`, `aui-carousel__next`, `aui-carousel__picker`, `aui-carousel__dot`, `aui-carousel__dot--current`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/carousel/tokens.json` (verified in CI). Component tokens: `--aui-carousel-radius` (falls back to `radius-md`) and `--aui-carousel-indicator` (picker dots; `color-primary`). The controls use the Button tokens.

## 11. States

First, middle, or last slide; loop; autoplay rotating or paused; a single slide (controls hidden).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| slide N | Next, a picker button, or a swipe | another slide; `aui-change` |
| rotating | hover, focus inside, or Pause | paused (hover and focus resume when they end; Pause until Play) |
| any | `goTo()` / `update({ index })` | the given slide, no event |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Carousel | Pause button (with autoplay), the current slide's content, previous, picker buttons, next. |
| Enter / Space | Buttons | Activate. |

## 14. ARIA contract

- Host: `role="region"`, `aria-roledescription="carousel"`, `aria-label`.
- Slides: `role="group"`, `aria-roledescription="slide"`, `aria-label` "N of M" (plus the slide label). Slides not shown are `inert`.
- Viewport: `aria-live="polite"`, or `"off"` while rotating automatically.
- Picker: a labelled group of buttons; the current one has `aria-current="true"`.
- Pause button: first in the tab order; its label switches between "Stop automatic slide show" and "Start automatic slide show".

## 15. Accessibility notes

- Moving content for more than five seconds needs a way to pause it (WCAG 2.2.2): the pause button is always there with autoplay.
- Users who prefer reduced motion start paused; the animation setting "none" disables rotation entirely.
- Changing slides never moves focus; announcements come from the live region.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Slides take the full width; on touch screens a horizontal swipe moves between slides; the controls sit under the slides.

## 17. RTL behavior

The track and swipe directions mirror: the next slide comes from the left.

## 18. Theme behavior

The picker dot color is in the contrast gate; the current dot is filled, not only recolored. Forced colors use `ButtonText` and `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { carousel: { showPicker: false } } });
```

## 20. Component configuration support

Instance `showPicker` and `locale` override configuration; configuration changes re-render existing carousels.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

Previous and next use the `chevron-left` and `chevron-right` icons (they follow the icon provider).

## 23. Security behavior

String content is rendered as text; `Node` content is inserted as given.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

All slides stay in the DOM (inert when not shown); moving changes one CSS custom property and the inert flags.

## 26. Supported data scale

Up to 100 slides; intended for a handful.

## 27. Usage examples

```ts
import { Carousel, type CarouselChangeDetail } from '@absoluteui/components/carousel';

const host = document.querySelector<HTMLElement>('#tour');
if (host) {
  Carousel.create(host, { label: 'Product tour', slides: [{ content: 'Welcome' }, { content: 'Create a project' }, { content: 'Invite your team' }] });
  host.addEventListener('aui-change', (event) => {
    const { index } = (event as CustomEvent<CarouselChangeDetail>).detail;
    host.dataset.step = String(index + 1);
  });
}
```

More examples, type-checked in CI: `metadata/carousel/examples.json`.

## 28. Edge cases

- Without `loop`, previous is disabled on the first slide and next on the last.
- With a single slide, the controls are hidden.
- `update({ slides })` keeps the current index when it still exists, otherwise the last slide.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CAROUSEL_OPTIONS` | configuration | Blank label, no slides or more than 100, slide content that is not a Node or string, an index out of range, or autoplay under 2000 ms. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- One slide is shown at a time.
- Swiping is for touch and pen; mouse users use the buttons.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Several slides per view or free scrolling: use Scroll Area with a horizontal strip.
- Autoplay intervals shorter than 2 seconds.

## 32. TypeScript definitions

```ts
interface CarouselConfig { showPicker: boolean }
interface CarouselSlide { content: Node | string; label?: string }
interface CarouselOptions extends Partial<CarouselConfig> {
  label: string;
  slides: readonly CarouselSlide[];
  index?: number;
  loop?: boolean;
  autoplay?: number | null;
  locale?: string;
}
interface CarouselChangeDetail { index: number }
```

## 33. Vanilla JS example

```ts
import { Carousel } from '@absoluteui/components/carousel';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/carousel/style.css';

const host = document.querySelector<HTMLElement>('#quotes');
if (host) Carousel.create(host, { label: 'Customer quotes', loop: true, slides: [{ content: 'Fast and reliable.' }, { content: 'Great support.' }] });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { CarouselSlide } from '@absoluteui/components/carousel';
import { AuiCarousel } from '@absoluteui/angular/carousel';

@Component({
  selector: 'app-announcements',
  imports: [AuiCarousel],
  template: `<aui-carousel label="Announcements" [slides]="slides" [loop]="true" [autoplay]="6000"></aui-carousel>`,
})
export class AnnouncementsComponent {
  readonly slides: CarouselSlide[] = [{ content: 'The office is closed on Monday.' }, { content: 'Benefits enrollment closes on the 30th.' }];
}
```

## 35. React example

```tsx
import { AuiCarousel } from '@absoluteui/react/carousel';

export function Example() {
  return <AuiCarousel label="Customer quotes" loop slides={[{ content: 'Fast and reliable.' }, { content: 'Great support.' }]} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiCarousel } from '@absoluteui/vue/carousel';
</script>

<template>
  <AuiCarousel label="Customer quotes" loop :slides="[{ content: 'Fast and reliable.' }, { content: 'Great support.' }]" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
