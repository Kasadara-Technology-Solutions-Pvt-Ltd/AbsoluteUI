---
title: Security and CSP
description: Run AbsoluteUI under a strict Content Security Policy with Trusted Types, and what the library never does with your data.
---

## Strict Content Security Policy

AbsoluteUI needs neither `unsafe-inline` nor `unsafe-eval`. Every component is tested on pages served with this policy, and any `securitypolicyviolation` fails the release:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types absoluteui
```

- **No inline styles.** Components set dynamic geometry through the CSSOM (`element.style.setProperty()`), which CSP allows, and custom themes are applied as constructable stylesheets.
- **No inline scripts or `eval`.** No string-based timers, no `new Function`, no inline event handler attributes.
- **Trusted Types.** The only HTML sink in the library goes through the sanitizer and a Trusted Types policy named `absoluteui`. List it in `trusted-types` when you enforce `require-trusted-types-for 'script'`.
- **`blob:` images** are needed only for Upload Queue image previews (object URLs).
- **Fonts.** The default font stack downloads nothing (Noto Sans if installed, else system fonts). If you load Noto Sans from Google Fonts, allow `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`, or self-host it.

## HTML content

Components render text as text. Where HTML is accepted (the Rich Text Editor's HTML input and output), it goes through the built-in sanitizer:

- parsed in an inert document, never assigned to a live element first;
- rebuilt from an allowlist of elements, attributes, and URL schemes (`http`, `https`, `mailto` by default);
- `style` and `on*` attributes, `srcdoc`, `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, and `javascript:` and `data:` URLs removed;
- stable: sanitizing the output again yields the same string.

The sanitizer is available to applications:

```ts
import { sanitizeHtmlToString, setSanitizedHtml } from '@absoluteui/core';

const safe = sanitizeHtmlToString('<p onclick="steal()">Hello <b>world</b></p><script>steal()</script>');
const target = document.querySelector('#preview');
if (target) setSanitizedHtml(target, '<a href="javascript:alert(1)">link</a> and <em>text</em>');
console.log(safe);
```

Sanitize on the server as well: client-side sanitization protects rendering, not your stored data.

## Privacy by default

- **No persistence.** Components never write user input to `localStorage`, `sessionStorage`, IndexedDB, or cookies. Saving state (for example a Data Table view or a dashboard layout) is always an explicit call that returns data to you.
- **No telemetry.** Nothing is sent anywhere. Network requests happen only through data-source functions you provide.
- **No sensitive logging.** Errors carry a code, a property path, and the expected type, never the value that failed.
- **Sensitive input.** Password Input supports masking, reveal, autocomplete hints, and clipboard policy; OTP Input supports one-time-code autofill.

## Reporting a vulnerability

Email **security@kasadara.com**. Acknowledgement within 3 business days and triage within 10. Advisories are published at [aui.kasadara.com/advisory](https://aui.kasadara.com/advisory). The full policy, including supported versions and response targets, is on the [security page](https://aui.kasadara.com/security/).
