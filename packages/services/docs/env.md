Safe answers to "where am I running and what does the user prefer?": runtime and feature detection, accessibility preferences (reduced motion, contrast, colour scheme), online state, page visibility, and the device's locale and time zone. Nothing touches `window`, `document`, or `navigator` at import time, and every function returns a documented default on the server or in a worker, so the same code runs during SSR.

### How do I respect reduced motion and other accessibility preferences?

`userPreferences()` reads the CSS media features once; `watchPreference` calls you when one changes (for example when the user switches the OS to dark mode). Both return defaults without `matchMedia`.

```ts
import { DEFAULT_USER_PREFERENCES, userPreferences, watchPreference } from '@absoluteui/services/env';

const panel = document.createElement('section');
const { reducedMotion, contrast } = userPreferences();
panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion ? 0 : 200 });
if (contrast === 'more') panel.classList.add('high-contrast');

const stop = watchPreference('reducedMotion', (reduce) => { panel.toggleAttribute('data-reduced-motion', reduce); });
stop();
DEFAULT_USER_PREFERENCES.reducedMotion; // => false // what the server sees
```

### How do I show an offline banner and queue work until the connection returns?

`isOnline()` reads `navigator.onLine`; `watchOnline` calls you on every change. A true value means the device has a network, not that your server is reachable, so still handle request failures.

```ts
import { isOnline, watchOnline } from '@absoluteui/services/env';

const banner = document.createElement('div');
banner.setAttribute('role', 'status');
const queued: { url: string; body: string }[] = [];

const submitTimesheet = async (body: string): Promise<void> => {
  if (!isOnline()) {
    queued.push({ url: '/api/timesheets', body });
    banner.textContent = 'You are offline. Your timesheet will be sent when you reconnect.';
    return;
  }
  await fetch('/api/timesheets', { method: 'POST', body });
};
const stop = watchOnline((online) => {
  banner.hidden = online;
  if (online) for (const item of queued.splice(0)) void fetch(item.url, { method: 'POST', body: item.body });
});
```

### How do I pause polling while the tab is hidden?

`pageVisibility()` and `watchVisibility` wrap `document.visibilityState`. `interval` in `@absoluteui/services/scheduler` does this for you with `pauseWhenHidden: true`.

```ts
import { pageVisibility, watchVisibility } from '@absoluteui/services/env';

let paused = pageVisibility() === 'hidden';
const stop = watchVisibility((state) => { paused = state === 'hidden'; });
pageVisibility(); // e.g. 'visible'
```

### How do I check for a browser feature before using it?

`supports(name)` tests capabilities, not user-agent strings, and never throws. `isSecureContext()` tells you whether Web Crypto and the async clipboard can work at all.

```ts
import { isSecureContext, supports } from '@absoluteui/services/env';

const compression = supports('compressionStream') ? 'deflate' : 'store';
const canShare = supports('webShare');
const canEncrypt = isSecureContext() && supports('webCrypto');
supports('broadcastChannel'); // => true // in current browsers
```

### How do I pick a default locale, time zone, and clock?

Use the device's settings as defaults only; let users override them in their profile. For working days and holidays, pair the time zone with a business calendar from `@absoluteui/helpers/business-calendar`.

```ts
import { deviceLocale, deviceTimeZone, prefers24Hour } from '@absoluteui/services/env';

const defaults = { locale: deviceLocale(), timeZone: deviceTimeZone(), hour24: prefers24Hour() };
defaults.timeZone; // e.g. 'Asia/Kolkata'
prefers24Hour('de-DE'); // => true
prefers24Hour('en-US'); // => false
```

### What goes wrong?

- Do not branch rendering on these values during SSR: the server sees defaults (light scheme, online, visible), so the client's first render may differ. Apply preferences after hydration or through CSS media queries.
- `rawUserAgentForDiagnostics()` is for support logs only; do not parse it for feature decisions.
