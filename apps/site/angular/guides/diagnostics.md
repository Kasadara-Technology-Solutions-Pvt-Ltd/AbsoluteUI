---
title: Development diagnostics
description: Console warnings for misuse of the Angular integration in development mode, and what each one means.
---

In development mode, misuse of the Angular integration is reported once per component kind as a console warning `AbsoluteUI <CODE>: <component> ...`. Messages never contain option or form values. Production builds remove the checks and their text.

| Code | Cause | Fix |
|---|---|---|
| `AUI_NG_VALUE_WITH_FORM` | A form control has both a value binding (`[(value)]` or `[value]`) and a form directive; the form directive wins. | Bind one of them. |
| `AUI_NG_ROUTER_VALUE` | `auiRouterNav` together with a bound `value`; the router decides the selection. | Remove the value binding. |
| `AUI_NG_TEMPLATE_COLUMN` | A table-level `auiCell`, `auiHeader`, or `auiEditor` names a column the table does not have; the template is ignored. | Fix the column id, or move the template into its `<aui-column>`. |
| `AUI_NG_TEMPLATE_OF` | `[auiCellOf]` is bound to a different array than `[rows]`; it only types the template. | Bind the same array. |
| `AUI_NG_CONFIG_KEY` | A `components` configuration key names no component (for example in configuration loaded at run time; TypeScript rejects unknown keys in code). | Use the configuration key named on the component page. |
| `AUI_NG_SERVER_FALLBACK` | A component could not render on the server and renders in the browser only. | See [Server rendering](/docs/angular/guides/server-rendering/). |

Errors from the components themselves, such as invalid options, are thrown as `AbsoluteUIError` with an error code in development and production alike; each component page lists its codes.
