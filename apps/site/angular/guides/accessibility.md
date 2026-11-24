---
title: Accessibility
description: Accessibility in AbsoluteUI Angular components, plus directives and a service for focus, roving tabindex, shortcuts, and announcements in your own code.
---

The components are accessible as rendered: roles, names, states, keyboard support, focus management, and announcements come from the framework-neutral components and are the same in Angular. Each component page links to its keyboard and screen-reader contract.

Templates you render inside components keep the component's accessible names: option, item, and header templates are decorative, and the label you pass stays the name.

## Building blocks for your own code

`@absoluteui/angular/a11y` exposes the same primitives the components use:

| API | Use |
|---|---|
| `[auiFocusTrap]` | Keeps Tab inside the host while enabled (`[auiFocusTrap]="editing()"`); moves focus in and returns it when released. |
| `[auiFocusRestore]` | Returns focus to the previously focused element when the host is destroyed, for example on an `@if` block. |
| `[auiRovingTabindex]` | One tab stop for a group of items, arrow keys between them (selector of the items as the value); `orientation`, `loop`, `typeahead`, `(activated)`. |
| `[auiHotkey]` | A keyboard shortcut on the host or the document: `auiHotkey="Mod+K" (hotkey)="openSearch()"`; "Mod" is Meta on Apple platforms and Control elsewhere. |
| `AuiLiveAnnouncer` | `announce(message, politeness)` through the shared live regions. |

```html
<div role="toolbar" aria-label="Formatting" auiRovingTabindex="button" orientation="horizontal">
  <button type="button">Bold</button>
  <button type="button">Italic</button>
</div>
```

The directives do nothing on the server.
