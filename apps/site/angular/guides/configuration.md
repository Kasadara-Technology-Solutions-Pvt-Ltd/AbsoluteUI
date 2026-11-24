---
title: Configuration
description: Configure locale, time zone, theme, density, icons, and component defaults for an application, a route, or a component subtree.
---

## Application

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAbsoluteUI } from '@absoluteui/angular';
import { AppComponent } from './app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideAbsoluteUI({
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      density: 'comfortable',
      animation: 'subtle',
      theme: 'absolute-default',
      components: { dataTable: { pageSize: 50 }, tabs: { activation: 'manual' } },
    }),
  ],
});
```

Besides the common settings and `components` (defaults per component, by configuration key), `provideAbsoluteUI` accepts `icons` (an icon library adapter), `iconSet` (icons to register), and `themeRuntime` (default `true`: apply theme, density, and animation to the document element; `{ applyDirection: true }` also sets `dir`). Each component page names its configuration key.

## Nested scopes

`provideAbsoluteUIConfig` creates a scope for a component subtree or a route; it merges over the parent scope:

```ts
import { Component } from '@angular/core';
import { provideAbsoluteUIConfig } from '@absoluteui/angular';

@Component({
  selector: 'app-berlin-office',
  providers: [provideAbsoluteUIConfig({ timezone: 'Europe/Berlin', components: { datePicker: { closeOnSelect: false } } })],
  template: '<ng-content />',
})
export class BerlinOfficeComponent {}
```

Precedence, from lowest to highest: built-in defaults, the theme, the application, nested scopes (outer to inner), then the component's own inputs. An input you do not bind leaves the configured value in place. Invalid values throw `AbsoluteUIError` where they are provided.

Scopes never write page-global state: each component receives its scope's settings as its own options. On the server nothing global is written, so concurrent requests stay isolated. Only the application scope in the browser is also applied globally, so plain AbsoluteUI code on the same page agrees with it.

## Services

| Service | Use |
|---|---|
| `AuiConfig` | The scope of the current injector: `common()` (the effective settings, a signal), `set()` and `patch()` at run time. |
| `AuiTheme` | `theme()`, `density()`, `animation()` signals; `setTheme()`, `setDensity()`, `setAnimation()`. |
| `AuiLocale` | `locale()`, `timezone()`, `disambiguation()` of the scope (the time zone defaults to UTC, never the host zone). |
| `AuiDirectionality` | `value()`: `'ltr'` or `'rtl'`. |
| `AuiIcons` | `register(icons)`, `setProvider(adapter)`. |
| `AuiPlatform` | `isBrowser`, `isServer`, `document`, `window` (null on the server), `supports(feature)`. |
| `AuiIds` | `next(prefix)`: unique ids in creation order, the same sequence on the server and in the browser. |

Full reference: [`@absoluteui/angular`](/docs/angular/api/).
