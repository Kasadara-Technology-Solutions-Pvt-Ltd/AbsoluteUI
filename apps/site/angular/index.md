---
title: Angular
description: Use AbsoluteUI components in Angular applications with signals, forms, templates, server rendering, and test harnesses.
---

`@absoluteui/angular` brings every AbsoluteUI component to Angular 22. The components keep rendering their own DOM, so behavior, accessibility, and styling are the same as everywhere else; the Angular layer adds:

- standalone components and directives, one entry point each;
- signal inputs, two-way bindings (`[(value)]`, `[(open)]`, `[(selected)]`, ...), and read-only state signals;
- Angular forms: every form control is a `ControlValueAccessor` and `Validator`, and shows Angular validation messages;
- configuration through dependency injection, scoped to the application, a route, or a component subtree;
- templates rendered into components (table cells, options, menu items, cards) and projected content;
- router navigation for Sidebar, Breadcrumb, Stepper, Tabs, and menus;
- server rendering with `@angular/ssr`;
- test harnesses for `@angular/cdk/testing`.

```ts
import { Component, signal } from '@angular/core';
import { AuiDatePicker } from '@absoluteui/angular/date-picker';
import type { PlainDate } from '@absoluteui/core';

@Component({
  selector: 'app-leave',
  imports: [AuiDatePicker],
  template: `<aui-date-picker label="First day of leave" [(value)]="start" />`,
})
export class LeaveComponent {
  readonly start = signal<PlainDate | null>(null);
}
```

## Where to go next

| Topic | Page |
|---|---|
| Install, theme, and first component | [Getting started](/docs/angular/guides/getting-started/) |
| Locale, time zone, theme, and component defaults | [Configuration](/docs/angular/guides/configuration/) |
| How inputs, bindings, outputs, and methods work | [Component API](/docs/angular/guides/component-api/) |
| Reactive and template-driven forms | [Forms](/docs/angular/guides/forms/) |
| Custom cells, options, items, and projected content | [Templates and content](/docs/angular/guides/templates/) |
| Dialogs, drawers, popovers, menus, toasts | [Overlays](/docs/angular/guides/overlays/) |
| Columns, state, grouping, inline editing | [Data tables](/docs/angular/guides/data-tables/) |
| Router navigation and link buttons | [Router](/docs/angular/guides/router/) |
| SSR and hydration | [Server rendering](/docs/angular/guides/server-rendering/) |
| Component harnesses | [Testing](/docs/angular/guides/testing/) |
| Every component | the Components section of this Angular sidebar; for example [Data Table for Angular](/docs/angular/components/data-table/) |
