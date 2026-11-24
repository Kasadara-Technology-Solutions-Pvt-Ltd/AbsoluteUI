# Session Warning Dialog

> Package: `@absoluteui/components/session-warning-dialog` | Styles: `@absoluteui/components/session-warning-dialog/style.css`, plus `dialog/style.css` and `button/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

An alert dialog that warns before a session ends (WCAG 2.2.1 Timing Adjustable). It provides:
- a countdown to a deadline given as an `Instant`, recomputed from the clock on every tick (timezone independent);
- "Stay signed in" (initial focus) and "Sign out" actions, and an expired state with "Sign in again";
- throttled announcements: at multiples of `announceInterval`, then at 60, 30, and 10 seconds, not every second;
- optional automatic opening `warnBefore` the deadline;
- events for every outcome: `aui-extend`, `aui-sign-out`, `aui-expire`.

**It pauses, extends, and ends nothing on its own.** Your application calls its session service when the events fire. AbsoluteUI is not an authentication provider.

## 2. Anatomy

```text
<dialog class="aui-dialog aui-dialog--sm aui-session-warning-dialog" role="alertdialog" aria-labelledby="T" aria-describedby="M C">
  <header class="aui-dialog__header"><h2 id="T">Your session is about to expire</h2></header>
  <div class="aui-dialog__body">
    <div class="aui-session-warning">
      <p class="aui-session-warning__message" id="M">You will be signed out soon ...</p>
      <p class="aui-session-warning__countdown" id="C">Time remaining: 1 minute, 30 seconds</p>
      <div class="aui-session-warning__content">(optional content)</div>
    </div>
  </div>
  <footer class="aui-dialog__footer">
    <button class="aui-button aui-button--primary" autofocus>Stay signed in</button>
    <button class="aui-button aui-button--secondary">Sign out</button>
  </footer>
</dialog>
```

## 3. When to use

- Before an inactivity or absolute session timeout.
- Any deadline the user must be able to extend with one simple action.

## 4. When not to use

- Non-urgent notices: use Toast or Alert.
- To enforce expiry: the server owns the session.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `dialog` | `Dialog` | Underlying Dialog. |
| `element` | `HTMLDialogElement` | The `<dialog>`; events are dispatched on it. |
| `isOpen` | `boolean` | Open state. |
| `remaining` | `Duration` | Time left (never negative). |
| `expired` | `boolean` | The deadline has passed. |
| `options` | `Readonly<SessionWarningDialogOptions>` | Current options. |

Options (`SessionWarningDialogOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `expiresAt` | `Instant` | - (required) | No | Session deadline. |
| `warnBefore` | `Duration` | - | No | Auto-open this long before `expiresAt` (>= 20 s). |
| `title` | `string` | "Your session is about to expire" | No | Title. |
| `message` | `string` | inactivity message | No | Body text. |
| `content` | `Node \| string` | - | No | Extra body content. |
| `extendLabel` | `string` | "Stay signed in" | No | Primary action. |
| `signOutLabel` | `string` | "Sign out" | No | Secondary action. |
| `expiredTitle` | `string` | "Your session has expired" | No | Title after expiry. |
| `expiredMessage` | `string` | "You have been signed out. Sign in again to continue." | No | Body after expiry. |
| `signInLabel` | `string` | "Sign in again" | No | Action after expiry. |
| `announceInterval` | `number` (s) | `60` | Yes | Announcement interval (15-3600). |
| `escapeExtends` | `boolean` | `true` | Yes | Escape means "Stay signed in"; `false` ignores Escape. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and units. |

Also exported: `formatRemaining(seconds, locale)` ("1 minute, 30 seconds", Intl unit and list formatting).

## 6. Methods

| Method | Description |
|---|---|
| `SessionWarningDialog.create(options, doc?)` | Create (appended to `doc.body`, closed). |
| `open()` | Open now; focus moves to "Stay signed in". |
| `close()` | Close programmatically. |
| `update(options)` | Merge options; a new `expiresAt` re-arms auto-open and expiry and leaves the expired state. |
| `destroy()` | Stop timers and remove the dialog. |

## 7. Events

All are dispatched on `element` and do not bubble (lifecycle events).

| Event | Detail | When |
|---|---|---|
| `aui-open` | `null` | Opened (from Dialog). |
| `aui-close` | `{ returnValue, reason }` | Closed (from Dialog). |
| `aui-extend` | `{ reason: 'action' \| 'escape' }` | The user chose to stay signed in. Extend the session, then `update({ expiresAt })`. |
| `aui-sign-out` | `{ reason: 'action' \| 'expired' }` | The user chose "Sign out", or "Sign in again" after expiry. |
| `aui-expire` | `null` | The deadline passed (once per deadline, open or closed). |

## 8. Slots/content areas

`content`: a Node or text below the countdown (Angular: the template content).

## 9. CSS parts/hooks

`aui-session-warning-dialog` (on the `<dialog>`), `aui-session-warning`, `__message`, `__countdown`, `__content`, plus Dialog and Button classes.

## 10. Design tokens

See `metadata/session-warning-dialog/tokens.json` (body only); frame, title, and actions use Dialog and Button tokens.

## 11. States

closed (scheduled when `warnBefore` is set), open and counting down, expired, suspended (answered; waits for a new `expiresAt`).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | `open()`, or `expiresAt - warnBefore` reached | open; focus on "Stay signed in" |
| open | "Stay signed in" or Escape | closed, suspended; `aui-extend` |
| open | "Sign out" | closed, suspended; `aui-sign-out` (`action`) |
| open | deadline | expired: title, message, and a single "Sign in again"; announced assertively; `aui-expire` |
| expired | "Sign in again" | closed; `aui-sign-out` (`expired`) |
| closed | deadline | `aui-expire` (stays closed) |
| suspended | `update({ expiresAt })` | scheduled again |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Open | Moves between the actions (focus is contained). |
| Enter / Space | Action | Activates it. |
| Escape | Open, not expired | "Stay signed in" (default); nothing with `escapeExtends: false`. |

## 14. ARIA contract

- Native modal `<dialog>` with `role="alertdialog"`, `aria-labelledby` -> title, `aria-describedby` -> message and countdown (message only after expiry).
- No close button: the choices are explicit.
- Actions are native buttons.

## 15. Accessibility notes

- WCAG 2.2.1: the user is warned and can extend with one action; `warnBefore` must be at least 20 seconds.
- Screen readers read the alert dialog when it opens. Afterwards the remaining time is announced politely only when it crosses a multiple of `announceInterval` and at 60, 30, and 10 seconds; expiry is announced assertively. Announcements go to a live region inside the modal.
- No animation of its own; the countdown is a text change once per second. Dialog transitions follow reduced motion.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Dialog size `sm`; actions wrap on narrow screens.

## 17. RTL behavior

As Dialog (logical properties). The countdown text is localized.

## 18. Theme behavior

Dialog surface and Button variants; the countdown uses `color-text` with tabular numbers.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { sessionWarningDialog: { announceInterval: 120, escapeExtends: false } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Timezone independent. `expiresAt` is an exact `Instant`; remaining time is `expiresAt - Date.now()`, a duration. The configured timezone and the device timezone are never used. Only the device clock matters: derive `expiresAt` from your server's expiry (for example "expires in N seconds" measured on receipt) to limit clock skew.

## 22. Icon customization points

None of its own; Dialog has no close button here.

## 23. Security behavior

- Never signs out, extends, or stores tokens: it emits events.
- All text is rendered with `textContent`; `content` strings are text.
- Extending must happen on the server; a client-only extension changes nothing.
- CSP-safe.

## 24. Data handling behavior

Holds only the deadline and texts in memory. No persistence, network access, or telemetry.

## 25. Performance characteristics

One timer at a time: a tick aligned to the next whole second while open, and one scheduling timer while closed (capped at 2^31 - 1 ms and re-armed). Budget: `open()` < 16 ms (e2e performance suite).

## 26. Supported data scale

One dialog per page.

## 27. Usage examples

```ts
import { duration, instant } from '@absoluteui/core';
import { SessionWarningDialog } from '@absoluteui/components/session-warning-dialog';

const warning = SessionWarningDialog.create({ expiresAt: instant(Date.now() + 15 * 60_000), warnBefore: duration(120_000) });
warning.element.addEventListener('aui-sign-out', () => {
  location.assign('/sign-out');
});
```

More examples, type-checked in CI: `metadata/session-warning-dialog/examples.json`.

## 28. Edge cases

- Background tabs throttle timers; the next tick recomputes from the clock, so the countdown is correct but may update late, and missed thresholds are announced once.
- A deadline already past at creation opens in the expired state without `aui-expire`.
- After the user answers, auto-open waits for `update({ expiresAt })`, so an unchanged deadline does not reopen the dialog in a loop.
- `update({ expiresAt })` while expired returns to the countdown.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SESSION_WARNING_DIALOG_OPTIONS` | configuration | `expiresAt` not an Instant, `warnBefore` not a Duration of at least 20 s, empty texts, invalid `content`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction creates no dialog.

## 30. Known limitations

- The device clock is trusted.
- Escape extends by default.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Activity tracking (the application decides when the session was used).
- Cross-tab coordination (use `BroadcastChannel` in the application and call `update()`).

## 32. TypeScript definitions

```ts
interface SessionWarningDialogConfig { announceInterval: number; escapeExtends: boolean }
interface SessionWarningDialogOptions extends Partial<SessionWarningDialogConfig> {
  expiresAt: Instant; warnBefore?: Duration; title?: string; message?: string; content?: Node | string;
  extendLabel?: string; signOutLabel?: string; expiredTitle?: string; expiredMessage?: string; signInLabel?: string; locale?: string;
}
interface SessionWarningExtendDetail { reason: 'action' | 'escape' }
interface SessionWarningSignOutDetail { reason: 'action' | 'expired' }
function formatRemaining(seconds: number, locale: string): string;
```

## 33. Vanilla JS example

```ts
import { duration, instant } from '@absoluteui/core';
import { SessionWarningDialog } from '@absoluteui/components/session-warning-dialog';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/dialog/style.css';
import '@absoluteui/components/session-warning-dialog/style.css';

const warning = SessionWarningDialog.create({ expiresAt: instant(Date.now() + 30 * 60_000), warnBefore: duration(5 * 60_000) });
warning.element.addEventListener('aui-extend', () => {
  void fetch('/api/session/refresh', { method: 'POST' }).then(() => {
    warning.update({ expiresAt: instant(Date.now() + 30 * 60_000) });
  });
});
warning.element.addEventListener('aui-expire', () => {
  location.assign('/signed-out');
});
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { instant, type Instant } from '@absoluteui/core';
import { AuiSessionWarningDialog } from '@absoluteui/angular/session-warning-dialog';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-session',
  imports: [AuiSessionWarningDialog, AuiButton],
  template: `
    <aui-session-warning-dialog [open]="warn()" [expiresAt]="expiresAt()"
                 (extended)="extend()" (signedOut)="signOut()" (closed)="warn.set(false)">
      <p>Unsaved changes are kept.</p>
    </aui-session-warning-dialog>
    <button type="button" auiButton (click)="warn.set(true)">Show the warning</button>
  `,
})
export class SessionComponent {
  readonly warn = signal(false);
  readonly expiresAt = signal<Instant>(instant(Date.now() + 15 * 60_000));
  extend(): void {
    this.expiresAt.set(instant(Date.now() + 15 * 60_000));
  }
  signOut(): void {
    location.assign('/sign-out');
  }
}
```

The directive goes on an `<ng-template>` (hand-written, like Dialog); `[open]` drives `open()`/`close()`, and `warnBefore` works too.

## 35. React example

```tsx
import { duration, type Instant } from '@absoluteui/core';
import { AuiSessionWarningDialog } from '@absoluteui/react/session-warning-dialog';

// Your session API renews or ends the session: AbsoluteUI is not an authentication provider.
export function Example({ expiresAt, renew, signOut }: { expiresAt: Instant; renew: () => void; signOut: () => void }) {
  return <AuiSessionWarningDialog expiresAt={expiresAt} warnBefore={duration(120_000)} onExtend={renew} onSignOut={signOut} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { duration, type Instant } from '@absoluteui/core';
import { AuiSessionWarningDialog } from '@absoluteui/vue/session-warning-dialog';
// Your session API renews or ends the session: AbsoluteUI is not an authentication provider.
defineProps<{ expiresAt: Instant }>();
const emit = defineEmits<{ renew: []; signOut: [] }>();
const warnBefore = duration(120_000);
</script>

<template>
  <AuiSessionWarningDialog :expires-at="expiresAt" :warn-before="warnBefore" @extend="emit('renew')" @sign-out="emit('signOut')" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
