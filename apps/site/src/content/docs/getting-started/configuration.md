---
title: Configuration
description: Configure locale, time zone, theme, density, direction, and component defaults globally, per component type, and per instance.
---

Configuration is validated, layered, and live: change it at runtime and existing components update without a reload.

## Common settings

```ts
import { configureAbsoluteUI } from '@absoluteui/core';

configureAbsoluteUI({
  common: {
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    density: 'comfortable',
    direction: 'ltr',
    animation: 'subtle',
    theme: 'absolute-default',
    disambiguation: 'compatible',
  },
});
```

| Setting | Values | Default |
|---|---|---|
| `locale` | BCP 47 language tag | `'en-US'` |
| `timezone` | IANA time zone name | `'UTC'` (never the machine's zone) |
| `density` | `'compact'`, `'comfortable'`, `'spacious'` | `'comfortable'` |
| `direction` | `'ltr'`, `'rtl'` | `'ltr'` |
| `animation` | `'subtle'` or `'none'`; `prefers-reduced-motion` always removes motion | `'subtle'` |
| `theme` | A built-in theme name or a theme registered with `registerTheme()` | `'absolute-default'` |
| `disambiguation` | `'compatible'`, `'earlier'`, `'later'`, `'reject'` for daylight-saving gaps and overlaps | `'compatible'` |
| `diagnostics` | `'production'` or `'development'` (richer error details while developing) | `'production'` |
| `timeZoneEngine` | Optional authoritative offset resolver; `null` uses the built-in `Intl` engine | `null` |

## Component defaults

Every configurable component has a configuration key (listed in its API reference). Settings under `components` apply to every instance of that component:

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import type {} from '@absoluteui/components/date-picker';
import type {} from '@absoluteui/components/kanban';

configureAbsoluteUI({
  common: { locale: 'en-GB', timezone: 'Europe/London' },
  components: {
    datePicker: { closeOnSelect: false },
    kanban: { wipPolicy: 'block' },
  },
});
```

Only options marked **Globally configurable** in a component's API reference can be set here. The keys are typed: a component's configuration type is available once the component is part of your program (the type-only imports above do that in a file that does not otherwise import the component).

## Precedence

The most specific valid value wins:

```text
built-in default
  -> active theme defaults
    -> global common configuration
      -> global component configuration
        -> options passed to create() or update()
```

A component option left unset follows the layers above it, so a later change to global configuration still reaches it.

## Validation

Configuration is validated as a whole. An invalid value throws an `AbsoluteUIError` with a stable `code` (for example `CFG_INVALID_VALUE`), the property path, and the expected type or range, and the previous configuration stays active. Error messages never include the value you passed, so secrets cannot leak into logs.

```ts
import { AbsoluteUIError, configureAbsoluteUI } from '@absoluteui/core';

try {
  configureAbsoluteUI({ common: { timezone: 'Mars/Olympus' } });
} catch (error) {
  if (error instanceof AbsoluteUIError) console.warn(error.code, error.message);
}
```

## Changing configuration at runtime

`configureAbsoluteUI()` replaces the global layer and notifies every component, which applies the change without being recreated. Subscribe to changes with `onConfigChange()`, and read the resolved settings with `getCommonConfig()`.
