---
title: Getting started with Angular
description: Install @absoluteui/angular, add the theme, provide the configuration, and render your first component.
---

## Requirements

- Angular 22 (`@angular/core`, `@angular/common`, and `@angular/forms` `^22.0.0`).
- Optional: `@angular/router` `^22.0.0` for router navigation, and `@angular/cdk` `^22.0.0` for the test harnesses.
- Every component is standalone; no NgModule is needed.

## Install

```sh
npm install @absoluteui/angular
```

The AbsoluteUI packages it builds on (`@absoluteui/components`, `core`, `theme`, `icons`, and `utilities`) are installed as its dependencies.

## Add the theme

Add the theme stylesheet once, in the `styles` of `angular.json`:

```json
"styles": ["@absoluteui/theme/absolute-default.css", "src/styles.css"]
```

Each component brings its own stylesheet, so there are no per-component style entries. All component rules live in cascade layers, so your styles override them without specificity battles.

## Provide the configuration

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAbsoluteUI } from '@absoluteui/angular';
import { AppComponent } from './app.component';

bootstrapApplication(AppComponent, {
  providers: [provideAbsoluteUI({ locale: 'en-IN', timezone: 'Asia/Kolkata', theme: 'absolute-default' })],
});
```

`provideAbsoluteUI` is optional: without it, components use their defaults. See [Configuration](/docs/angular/guides/configuration/) for every setting and for nested scopes.

## Your first component

Import each component from its own entry point, so the application ships only what it uses:

```ts
import { Component, signal } from '@angular/core';
import { AuiDatePicker } from '@absoluteui/angular/date-picker';
import type { PlainDate } from '@absoluteui/core';

@Component({
  selector: 'app-start-date',
  imports: [AuiDatePicker],
  template: `<aui-date-picker label="Start date" [(value)]="start" />`,
})
export class StartDateComponent {
  readonly start = signal<PlainDate | null>(null);
}
```

Every component has a page under [Components](/docs/angular/) with its inputs, two-way bindings, outputs, and an example. Behavior, keyboard support, and design tokens are described once, on the framework-neutral component pages, and apply unchanged.

## Next steps

- [Component API](/docs/angular/guides/component-api/): how inputs, models, outputs, and methods map to the components.
- [Forms](/docs/angular/guides/forms/): reactive and template-driven forms.
- [Server rendering](/docs/angular/guides/server-rendering/): Angular SSR and hydration.
