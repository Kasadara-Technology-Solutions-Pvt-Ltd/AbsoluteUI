---
title: Component API
description: How AbsoluteUI components appear in Angular - elements and attributes, inputs, two-way bindings, read-only signals, outputs, and typed methods.
---

The Angular components wrap the framework-neutral AbsoluteUI components. The neutral component renders the DOM and owns behavior and accessibility; Angular provides inputs, bindings, forms, templates, and lifecycle. The rules below hold for every component.

## Elements and attributes

| Kind | Form | Examples |
|---|---|---|
| Components that render their own content | an element `aui-<name>` | `<aui-date-picker>`, `<aui-data-table>`, `<aui-dialog>` |
| Components that enhance a native element or a trigger | an attribute | `button[auiButton]`, `a[auiButton]`, `h1[auiHeading]`, `a[auiLink]`, `form[auiForm]`, `button[auiMenu]`, `[auiTooltip]`, `[auiPopover]`, `[auiContextMenu]`, `[auiFlex]` |

The class is `Aui<Name>`, the entry point `@absoluteui/angular/<name>`, and the template reference name `aui<Name>`: `#picker="auiDatePicker"`.

## Inputs

Inputs mirror the component options one to one; required options are required inputs. Boolean inputs accept bare attributes, like native ones: `<aui-text-input label="Name" required readOnly />`. Inputs you do not bind are not passed, so configuration still applies; only inputs that change are sent to the component.

## Two-way bindings

State the user changes is a model: `[(value)]` on form controls (`[(checked)]` on Checkbox and Switch), `[(open)]` on overlays, `[(page)]` and `[(pageSize)]` on Pagination, `[(sort)]`, `[(selected)]`, `[(filters)]`, and more on the Data Table. Each component page lists its models. Values that come from the component through a model are not sent back to it.

## Read-only state

State the component reports but you do not set is a signal: `isOpen()` on Select and the pickers, `rowCount()` on the Data Table, `canUndo()` and `canRedo()` on Org Chart, Kanban, Gantt, and Scheduler, and others. Read them through a template reference:

```html
<aui-select #status="auiSelect" label="Status" [options]="statuses" />
@if (status.isOpen()) { <span>Choosing a status</span> }
```

Signals hold their initial value until the component exists (after the first render in the browser).

## Outputs

Outputs use action names, never native DOM event names: `changed`, `valueInput`, `opened`, `closed`, `selected`, `submitted`, `dismissed`. `$event` is the event detail:

```html
<aui-tabs label="Sections" [tabs]="tabs" (changed)="current = $event.value" />
```

## Methods

There is no access to the underlying component object; imperative needs are typed methods on the Angular component, reached through `viewChild` or a template reference: `picker.open()`, `table.getState()`, `form.submit()`. Methods that change state keep the bound models up to date: after `tabs.select('b')`, a bound `[(value)]` holds `'b'`.

## Content

Components that render their own content replace the host's children. Content goes in through inputs, [templates](/docs/angular/guides/templates/) for the render slots components have, and the projected parts listed there (Card parts, Alert message, overlay bodies).
