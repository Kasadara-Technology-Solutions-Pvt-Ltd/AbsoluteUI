---
title: Server rendering
description: How AbsoluteUI components render with Angular SSR and prerendering, and what happens during hydration.
---

AbsoluteUI components work with `@angular/ssr`, prerendering, and client hydration.

## What renders on the server

Element components (`<aui-*>`) render on the server: inputs, form values, configuration scopes, templates, and projected content are part of the server HTML, so the page does not shift when the browser takes over. Their hosts skip hydration: Angular hydrates the rest of the page, and each component is re-created in the browser from the same inputs after the server markup is cleared.

Each component page states its server rendering. Exceptions:

- Rich Text Editor renders in the browser only: its HTML sanitizer needs the browser's HTML parser.
- Spinner renders nothing on the server by design while its delay runs.
- Attribute directives on native elements (`button[auiButton]`, `a[auiButton]`, `button[auiMenu]`, `[auiTooltip]`, ...) apply in the browser; give enhanced buttons their classes (`class="aui-button aui-button--primary"`) if they must be styled before hydration.
- Modal overlays never open on the server; the dialog and drawer services do nothing there.
- Dashboard Grid, Dashboard Widget, and Form Field apply in the browser, because their hosts contain content Angular manages.

In development mode, a component that cannot render on the server is named in a console warning, and renders in the browser.

## Isolation

Configuration and the document theme attributes are applied on the server without global state, so concurrent requests never share settings. Observers and media queries are inert on the server, and `AuiPlatform` tells your own code where it runs (`isBrowser`, `isServer`; `window` is null on the server). `AuiIds` produces the same id sequence on the server and in the browser.
