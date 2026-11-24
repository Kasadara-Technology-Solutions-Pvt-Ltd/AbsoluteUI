# Password Strength Meter

> Package: `@absoluteui/components/password-strength-meter` | Styles: `@absoluteui/components/password-strength-meter/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

Advisory password feedback for sign-up and change-password forms. It provides:
- a **password requirements** checklist (length, character classes, custom rules) with state in text;
- a strength rating (Weak, Fair, Good, Strong) from a **pluggable evaluator**, with a four-segment bar;
- debounced, polite announcements of the rating and the number of requirements met;
- attachment to a Password Input (or any `<input>`), or evaluation of a bound value.

> **Advisory only, not a security guarantee.** The default evaluator counts rules. It does not detect dictionary words, personal data, keyboard patterns, or breached passwords. Your server must enforce the real password policy. AbsoluteUI is not an authentication or security provider.

## 2. Anatomy

```text
<div class="aui-password-strength-meter aui-password-strength-meter--score-3">
  <div class="aui-password-strength-meter__body" id="M">          (describedById)
    <div class="aui-password-strength-meter__header">
      <span class="__label">Password strength</span> <span class="__rating">Good</span>
    </div>
    <div class="aui-password-strength-meter__bar" aria-hidden="true">
      <span class="__segment __segment--filled"></span> x4
    </div>
    <ul class="aui-password-strength-meter__requirements" aria-label="Password requirements">
      <li class="__requirement __requirement--met" data-requirement="min-length">
        <svg aria-hidden="true"/><span>At least 12 characters</span><span class="aui-visually-hidden">, met</span>
      </li>
    </ul>
  </div>
</div>
```

## 3. When to use

- Next to a Password Input with `autocomplete: 'new-password'`.
- To show a password policy as a live checklist.

## 4. When not to use

- Sign-in forms: do not rate existing passwords.
- As the only enforcement of a password policy.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `describedById` | `string` | Add to the input's `aria-describedby` (rating and checklist). |
| `result` | `PasswordStrengthResult` | `{ score, label, requirements }` of the last evaluation; never the password. |
| `options` | `Readonly<PasswordStrengthMeterOptions>` | Current options. |

Options (`PasswordStrengthMeterOptions`, all optional):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | "Password strength" | No | Visible heading. |
| `input` | `HTMLInputElement \| { input: HTMLInputElement }` | - | No | Input to follow. |
| `value` | `string` | - | No | Value to evaluate (framework bindings). |
| `requirements` | `readonly PasswordRequirement[]` | `defaultPasswordRequirements()` | No | Checklist rules. |
| `evaluate` | `PasswordStrengthEvaluator` | `defaultPasswordEvaluator` | No | Scoring. |
| `icons` | `Partial<{ met; unmet: IconRef }>` | - | No | Icon overrides. |
| `showRequirements` | `boolean` | `true` | Yes | Show the checklist. |
| `announce` | `boolean` | `true` | Yes | Debounced polite summary. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and numbers. |

Exports: `passwordRequirements.minLength(n)`, `.lowercase()`, `.uppercase()`, `.digit()`, `.symbol()` (Unicode-aware: `\p{Ll}`, `\p{Lu}`, `\p{Nd}`, anything not a letter, number, or space), `defaultPasswordRequirements()`, `defaultPasswordEvaluator`.

## 6. Methods

| Method | Description |
|---|---|
| `PasswordStrengthMeter.create(host, options?)` | Render into `host` (children are replaced). |
| `evaluate(value)` | Evaluate and render; returns the result (no event, no announcement). |
| `attach(target)` / `detach()` | Follow an input's `input` events / stop. |
| `update(options)` | Merge and apply options; a changed `value` counts as user input. |
| `destroy()` | Detach, cancel the pending announcement, remove rendering. |

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-change` | `{ result }` | Yes | The rating or a requirement changed after user input (or a bound `value` change). |

## 8. Slots/content areas

None. Requirement labels are text (or functions of the locale).

## 9. CSS parts/hooks

`aui-password-strength-meter`, `--score-0` ... `--score-4`, `__body`, `__header`, `__label`, `__rating`, `__bar`, `__segment` (`--filled`), `__requirements`, `__requirement` (`--met`, `data-requirement`), `__icon`.

## 10. Design tokens

See `metadata/password-strength-meter/tokens.json`. Segments: `color-surface-sunken`, `color-border-strong`, `color-error-fg`, `color-warning-fg`, `color-success-fg`, `progress-height`.

## 11. States

Score 0 (empty), 1 Weak, 2 Fair, 3 Good, 4 Strong; each requirement met or not met.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | input event on the attached input | re-evaluated; `aui-change` when the result changed; summary announced after a 1 s pause when it differs from the last one |
| any | `evaluate(value)` | re-evaluated silently |
| any | empty value | score 0; no announcement |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable; users type in the attached input. |

## 14. ARIA contract

- Checklist: `<ul aria-label="Password requirements">`; each item's state is visually hidden text (", met" / ", not met").
- The segmented bar is `aria-hidden="true"`; the rating text carries the meaning.
- Reference `describedById` from the input (Password Input: `describedBy: [meter.describedById]`) so the rating and checklist are read with the field.

## 15. Accessibility notes

- Status is never conveyed by color or icon alone.
- One polite summary per pause ("Password strength: Good. 4 of 4 requirements met."), not per keystroke.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Full width; the segments share the width; checklist items wrap.

## 17. RTL behavior

Segments fill from the inline start; icons precede text in the inline direction.

## 18. Theme behavior

Weak = `color-error-fg`, Fair = `color-warning-fg`, Good/Strong = `color-success-fg` fills on `color-surface-sunken`; met requirements use `color-success-fg` with a check icon. Forced-colors mode: `Highlight` fills, `CanvasText` borders.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { passwordStrengthMeter: { showRequirements: true, announce: false } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.met` (default `check`), `icons.unmet` (default `close`).

## 23. Security behavior

- Advisory only (see Purpose). For stronger feedback, supply an evaluator backed by a vetted strength estimator, and check breached passwords on your server.
- The password is never stored by the meter, logged, emitted, or announced. Requirement tests and evaluators receive it and must not store it either.
- All text is rendered with `textContent`. CSP-safe.

## 24. Data handling behavior

With `input`, the value is read on each input event and discarded after evaluation. With `value`, it is held in the options object until updated. No persistence, network access, or telemetry.

## 25. Performance characteristics

Evaluation runs the requirement tests and the evaluator synchronously; the checklist is re-rendered per evaluation. Budget: `evaluate()` with the default rules < 1 ms (e2e performance suite).

## 26. Supported data scale

Designed for up to about 20 requirements.

## 27. Usage examples

```ts
import { PasswordInput } from '@absoluteui/components/password-input';
import { PasswordStrengthMeter } from '@absoluteui/components/password-strength-meter';

const inputHost = document.createElement('div');
const meterHost = document.createElement('div');
document.body.append(inputHost, meterHost);
const password = PasswordInput.create(inputHost, { label: 'New password', autocomplete: 'new-password' });
const meter = PasswordStrengthMeter.create(meterHost, { input: password });
password.update({ describedBy: [meter.describedById] });
```

More examples, type-checked in CI: `metadata/password-strength-meter/examples.json`.

## 28. Edge cases

Default evaluator (documented, not authoritative):

| Condition | Score |
|---|---|
| Empty | 0 |
| A single repeated character (for example `aaaaaaaaaaaa`) | 1 Weak |
| Fewer than half of the requirements met | 1 Weak |
| Some requirements unmet | 2 Fair |
| All met | 3 Good |
| All met and at least 16 characters | 4 Strong |

- Lengths count Unicode code points.
- With no requirements, the default evaluator rates any non-empty password Good (3) or Strong (4).
- An evaluator returning a score outside 0-4 is a configuration error.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `PASSWORD_STRENGTH_METER_OPTIONS` | configuration | Invalid label, input, value, evaluator, requirements (duplicate or empty ids, missing label or test), a score outside 0-4, or `minLength(n)` outside 1-1024. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

## 30. Known limitations

- Synchronous evaluation only.
- Default rules must be aligned with your server policy through `requirements`.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Asynchronous evaluators (run breach checks in the application, then call `evaluate` or pass a custom evaluator result).
- HTML in requirement labels.

## 32. TypeScript definitions

```ts
type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;
interface PasswordRequirement { readonly id: string; readonly label: string | ((locale: string) => string); readonly test: (value: string) => boolean }
interface PasswordRequirementResult { readonly id: string; readonly label: string; readonly met: boolean }
interface PasswordStrength { readonly score: PasswordStrengthScore; readonly label?: string }
type PasswordStrengthEvaluator = (value: string, requirements: readonly PasswordRequirementResult[]) => PasswordStrength;
interface PasswordStrengthResult { readonly score: PasswordStrengthScore; readonly label: string; readonly requirements: readonly PasswordRequirementResult[] }
type PasswordStrengthTarget = HTMLInputElement | { readonly input: HTMLInputElement };
interface PasswordStrengthMeterConfig { showRequirements: boolean; announce: boolean }
interface PasswordStrengthMeterOptions extends Partial<PasswordStrengthMeterConfig> {
  label?: string; input?: PasswordStrengthTarget; value?: string; requirements?: readonly PasswordRequirement[];
  evaluate?: PasswordStrengthEvaluator; locale?: string; icons?: Partial<PasswordStrengthMeterIcons>;
}
interface PasswordStrengthMeterChangeDetail { result: PasswordStrengthResult }
```

## 33. Vanilla JS example

```ts
import { PasswordStrengthMeter, passwordRequirements } from '@absoluteui/components/password-strength-meter';
import '@absoluteui/components/password-strength-meter/style.css';

const input = document.querySelector<HTMLInputElement>('#pw');
const host = document.querySelector<HTMLElement>('#pw-meter');
if (input && host) {
  PasswordStrengthMeter.create(host, { input, requirements: [passwordRequirements.minLength(15)] });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuiPasswordInput } from '@absoluteui/angular/password-input';
import { AuiPasswordStrengthMeter } from '@absoluteui/angular/password-strength-meter';

@Component({
  selector: 'app-sign-up',
  imports: [ReactiveFormsModule, AuiPasswordInput, AuiPasswordStrengthMeter],
  template: `
    <aui-password-input label="New password" autocomplete="new-password" [formControl]="password"></aui-password-input>
    <aui-password-strength-meter [value]="password.value"></aui-password-strength-meter>
  `,
})
export class SignUpComponent {
  readonly password = new FormControl('', { nonNullable: true });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiPasswordInput } from '@absoluteui/react/password-input';
import { AuiPasswordStrengthMeter } from '@absoluteui/react/password-strength-meter';

export function Example() {
  const [password, setPassword] = useState('');
  return (
    <>
      <AuiPasswordInput label="New password" autocomplete="new-password" value={password} onValueChange={setPassword} />
      <AuiPasswordStrengthMeter value={password} />
    </>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiPasswordInput } from '@absoluteui/vue/password-input';
import { AuiPasswordStrengthMeter } from '@absoluteui/vue/password-strength-meter';
const password = ref('');
</script>

<template>
  <AuiPasswordInput v-model="password" label="New password" autocomplete="new-password" />
  <AuiPasswordStrengthMeter :value="password" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
