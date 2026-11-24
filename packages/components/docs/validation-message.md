# Validation Message

> Package: `@absoluteui/components/validation-message` | Styles: `@absoluteui/components/validation-message/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A standalone field message for controls that AbsoluteUI does not render itself (SPEC section 18.8). `ValidationMessage` shows an error, warning, success, or info message with a tone icon, adds its id to the target's `aria-describedby`, and, for errors, sets `aria-invalid="true"` on the target. AbsoluteUI inputs render the same `aui-validation-message` markup internally, so standalone and built-in messages look identical.

## 2. Anatomy

```text
<div class="aui-validation-message aui-validation-message--error" id=auto [hidden]>   (consumer host)
  <svg class="aui-validation-message__icon aui-icon" aria-hidden="true">
  <span class="aui-validation-message__text">Message</span>
</div>
<input aria-describedby="... auto" aria-invalid="true">                               (target, `for`)
```

## 3. When to use

- Messages for consumer-rendered or third-party controls that should match AbsoluteUI field messages.
- Non-error field feedback such as an availability-check result (success, warning, info).

## 4. When not to use

- AbsoluteUI inputs and Form Field: they render their own messages; use `setCustomError()` for external errors.
- Form-level or page-level errors: use Error Summary.
- Transient notifications: use a toast.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; receives an id if it has none. |
| `message` | `string` | Current message (`''` when hidden). |
| `tone` | `ValidationMessageTone` | Current tone (default `'error'`). |

Options: `message`, `tone`, `for`, and `icons`. Full table: `metadata/validation-message/api.json`.

No globally configurable options (`validationMessage` is registered with an empty schema) and no inherited `locale`: the message text is always provided by the consumer.

## 6. Methods

| Method | Description |
|---|---|
| `ValidationMessage.create(host, options?)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setMessage(message, tone?)` | Set the message and optionally the tone. |
| `clear()` | Hide the message and unlink the target. |
| `update(options)` | Merge and apply options; invalid options throw before anything changes. |
| `destroy()` | Unlink the target, remove rendering and classes, unhide the host. |

## 7. Events

None.

## 8. Slots/content areas

None. The message is text.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-validation-message` | Host; also the built-in field error element. |
| `aui-validation-message--error`, `--warning`, `--success`, `--info` | Tone modifiers. |
| `aui-validation-message__icon` | Tone icon. |
| `aui-validation-message__text` | Message text. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/validation-message/tokens.json`: `color-error-fg`, `color-warning-fg`, `color-success-fg`, `color-info-fg`, `font-size-sm`, `icon-size-sm`, `space-1`.

## 11. States

hidden (empty message), error, warning, success, info.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| hidden | message set | visible; target described; `aria-invalid` for error tone |
| error | tone changes to warning/success/info | `aria-invalid` removed (if this message set it) |
| visible | `for` changes | old target unlinked; new target linked |
| visible | `clear()` or empty message | hidden; target unlinked |
| any | `destroy()` | target unlinked; host emptied and unhidden |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| None | Any | Not focusable; the message is read with the target when the target is focused. |

## 14. ARIA contract

- The host id is added to the target's `aria-describedby` while a message is shown; other ids are kept (and restored on unlink).
- `aria-invalid="true"` on the target only for the error tone. It is removed when the tone changes, the message clears, the target changes, or on `destroy()`, but only if this instance set it: a consumer-managed `aria-invalid="true"` present before the error was shown is never removed.
- The icon is `aria-hidden`.

## 15. Accessibility notes

- Tones pair color with a distinct icon; the text must still state the problem (WCAG 1.4.1).
- Only the error tone marks the target invalid; the other tones are descriptive only.
- The message is not a live region: it is read when the user reaches the target. Announce important changes separately (for example with `announce()` from `@absoluteui/utilities`) if the user is elsewhere.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Icon and text in a row; long messages wrap anywhere.

## 17. RTL behavior

Follows the document direction; the icon sits at the inline start.

## 18. Theme behavior

Tone foreground role tokens only; no background. Forced-colors mode uses system text colors, with the icon distinguishing tones.

## 19. Global configuration support

None. `validationMessageConfig` is registered with an empty schema, so `configureAbsoluteUI({ components: { validationMessage: {} } })` accepts no options.

## 20. Component configuration support

All options are instance options and dynamic through `update()`.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`), `icons.warning` (`alert-triangle`), `icons.success` (`check-circle`), and `icons.info` (`info`).

## 23. Security behavior

The message uses `textContent` and is never parsed as HTML. Do not include raw user input in messages (SPEC section 14.4). CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

No listeners or subscriptions. Each update re-renders the icon and text.

## 26. Supported data scale

One message per instance, one target per message.

## 27. Usage examples

```ts
import { ValidationMessage } from '@absoluteui/components/validation-message';

const input = document.createElement('input');
const messageHost = document.createElement('div');
document.body.append(input, messageHost);
ValidationMessage.create(messageHost, { for: input, message: 'Enter a coupon code.' });
```

More examples, type-checked in CI: `metadata/validation-message/examples.json`.

## 28. Edge cases

- An empty message hides the host and removes the reference from the target, keeping the other `aria-describedby` ids.
- Without `for`, the message is only visual.
- If the target already has `aria-invalid="true"` when an error is shown, the message leaves it to the consumer and does not remove it later.
- `destroy()` keeps the generated host id.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `VALIDATION_MESSAGE_OPTIONS` | configuration | `tone` is not error, warning, success, or info; or `for` is not an `HTMLElement` or `null`. |

A failed construction or update leaves no rendering or ARIA changes behind.

## 30. Known limitations

- Not a live region.
- The icon element is re-created on every update.
- No `locale`: the text is consumer-provided.
- Screen-reader reading has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML or links in the message.
- One message describing several targets.

## 32. TypeScript definitions

```ts
type ValidationMessageTone = 'error' | 'warning' | 'success' | 'info';
interface ValidationMessageIcons { error: IconRef; warning: IconRef; success: IconRef; info: IconRef }
interface ValidationMessageOptions { message?: string; tone?: ValidationMessageTone; for?: HTMLElement | null; icons?: Partial<ValidationMessageIcons> }
interface ValidationMessageConfig {}
```

## 33. Vanilla JS example

```ts
import { ValidationMessage } from '@absoluteui/components/validation-message';
import '@absoluteui/components/validation-message/style.css';

const input = document.querySelector<HTMLInputElement>('#promo');
const host = document.querySelector<HTMLElement>('#promo-message');
if (input && host) {
  const message = ValidationMessage.create(host, { for: input });
  input.addEventListener('change', () => {
    if (input.value === '') message.clear();
    else if (/^[A-Z0-9]{6}$/.test(input.value)) message.setMessage('Code applied.', 'success');
    else message.setMessage('Enter a 6-character code.', 'error');
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiValidationMessage } from '@absoluteui/angular/validation-message';
import { AuiFormField } from '@absoluteui/angular/form-field';

@Component({
  selector: 'app-promo',
  imports: [AuiValidationMessage, AuiFormField],
  template: `
    <aui-form-field label="Promo code"><input #promo name="promo" /></aui-form-field>
    <aui-validation-message [for]="promo" [message]="message" tone="error"></aui-validation-message>`,
})
export class PromoComponent {
  message = '';
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
