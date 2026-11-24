---
title: Performance
description: Measured mount, update, and scroll times of AbsoluteUI Angular screens, and how the integration keeps updates small.
---

## How updates stay small

- Only inputs that changed are sent to a component, and values that came from the component through a two-way binding are not sent back.
- Components use `OnPush` change detection and signals; they work without Zone.js.
- Templates render as embedded views only for the nodes a component shows (for example the rows in a virtual table's window) and are destroyed when those nodes go.
- Each entry point is imported separately, so an application ships only the components it uses.

## Measured

Headless Chromium on a developer workstation, ahead-of-time compiled with strict templates; each benchmark runs in the test suite against fixed budgets.

| Scenario | Measured | Budget |
|---|---|---|
| 100 Text Inputs in a reactive form: mount | 438 ms | 1,500 ms |
| The same form: `patchValue` on every field | 14 ms | 300 ms |
| Data Table with 100,000 rows, virtual scrolling, a cell template: mount | 282 ms | 1,500 ms |
| The same table: scroll to the middle, including one frame | 33 ms | 100 ms |
| Dashboard with 4 charts, 6 stat cards, tabs, and a 1,000-row paged table: mount | 117 ms | 1,500 ms |
| Mount and destroy in a loop (form / dashboard), average | 155 ms / 54 ms | 300 ms |

After the loops and a forced garbage collection, no component instance or host element is retained.

The framework-neutral components have their own budgets (for example Combobox and Multi Select create with 1,000 options in under 100 ms); see [Performance](/docs/quality/performance/).
