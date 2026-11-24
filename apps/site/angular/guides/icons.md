---
title: Icons
description: "Show AbsoluteUI icons with aui-icon: registered names, the AbsoluteUI icon set with variants, colors, layers, overlays, and stroke width, and opt-in animation driven by state."
---

## The icon outlet

`<aui-icon>` from `@absoluteui/angular/icon` renders one icon. `name` takes a registered name (`'calendar'`), a name your icon provider resolves (`provideAbsoluteUI({ icons })`), or an icon definition, such as an icon imported from `@absoluteui/icons/set`. The icon is decorative unless you set `label`; label icon-only buttons on the button instead.

| Input | Type | Updates |
|---|---|---|
| `name` (required) | `IconRef` | Renders again |
| `size` | `'xs'` ... `'xl'`, a CSS length, or a number of pixels | In place |
| `label` | `string` | In place |
| `variant` | `'outline'`, `'solid'`, `'duotone'`, `'multicolor'` (the icon must provide it) | Renders again |
| `colors` | Role colors, for example `{ accent: 'var(--aui-color-success-fg)' }` | In place |
| `layers` | Per-layer `color`, `opacity`, `hidden` | In place |
| `strokeWidth` | 0.5 to 4 (default: `--aui-icon-stroke-width`, else 2) | In place |
| `overlays`, `container`, `strokeScaling`, `rotate`, `flip`, `dir` | As in `renderIcon` | Renders again |
| `animation` | An animation the icon lists (`IconAnimationOptions`) | Starts or stops the animation |
| `animationState` | `'idle'`, `'loading'`, `'success'`, `'error'` | In place |

The [Icons guide](/docs/guides/icons/) describes every option.

## Icons of the AbsoluteUI icon set

Import only the icons you use; each is its own module, so the rest stays out of your bundle.

```ts
import { Component, signal } from '@angular/core';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiIcon } from '@absoluteui/angular/icon';
import { downloadIcon, lockOverlay, spinnerIcon } from '@absoluteui/icons/set';
import type { IconAnimationState } from '@absoluteui/icons';

@Component({
  selector: 'app-icons',
  imports: [AuiButton, AuiIcon],
  template: `
    <aui-icon [name]="download" variant="duotone" [colors]="{ accent: 'var(--aui-color-success-fg)' }" size="lg" />
    <aui-icon [name]="download" [overlays]="[{ icon: lock }]" label="Download locked" />
    <aui-icon [name]="spinner" [animation]="{ preset: 'spin' }" [animationState]="state()" label="Saving" />
    <button type="button" auiButton (click)="state.set(state() === 'loading' ? 'idle' : 'loading')">Toggle saving</button>
  `,
})
export class IconsDemo {
  readonly download = downloadIcon;
  readonly spinner = spinnerIcon;
  readonly lock = lockOverlay;
  readonly state = signal<IconAnimationState>('idle');
}
```

To use the set by name everywhere (`<aui-icon name="download" />`, and component `icons` options), import `@absoluteui/icons/set/register` once at start-up. It bundles the whole set and replaces built-in icons of the same names in every component.

## Animation and server rendering

- Icons are static unless you set `animation`, and the icon must list the preset (the gallery on the [Icons API page](/docs/api/icons/) shows each icon's presets).
- `animationState` drives state triggers: `loading`, `success`, and `error` play; `idle` stops. For `manual` and `on-change` triggers, call `play()` on the component (`#icon="auiIcon"`).
- Users who prefer reduced motion see the static icon; `setIconMotionPolicy` sets the application policy.
- The server renders the static icon; motion starts in the browser after hydration, and the animation is disposed when the component is destroyed.
