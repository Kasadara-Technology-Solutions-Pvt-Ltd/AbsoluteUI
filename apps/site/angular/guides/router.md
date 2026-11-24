---
title: Router
description: Connect Sidebar, Breadcrumb, Stepper, Tabs, Menu Bar, and Menu to the Angular router, and style router links as buttons.
---

## Navigation components

`auiRouterNav` from `@absoluteui/angular/router` connects `<aui-sidebar>`, `<aui-breadcrumb>`, `<aui-stepper>`, `<aui-tabs>`, `<aui-menu-bar>`, and `button[auiMenu]` to the router. Items take router fields next to their own: `routerLink` (a string or commands; relative commands resolve against the component's route), `queryParams`, `fragment`, `queryParamsHandling`, `preserveFragment`, `state`, `replaceUrl`, `skipLocationChange`, and `activeOptions`. Type item lists with `AuiRouterItem<T>`.

```ts
import { Component } from '@angular/core';
import type { SidebarItem } from '@absoluteui/components/sidebar';
import { AuiSidebar } from '@absoluteui/angular/sidebar';
import { AuiRouterNav, type AuiRouterItem } from '@absoluteui/angular/router';

@Component({
  selector: 'app-shell',
  imports: [AuiSidebar, AuiRouterNav],
  template: `<aui-sidebar auiRouterNav label="Main" [items]="nav" />`,
})
export class ShellComponent {
  readonly nav: readonly AuiRouterItem<SidebarItem>[] = [
    { id: 'people', label: 'People', routerLink: '/people' },
    { type: 'group', id: 'reports', label: 'Reports', items: [{ id: 'annual', label: 'Annual', routerLink: ['/reports', 'annual'], queryParams: { view: 'table' } }] },
    { id: 'help', label: 'Help', href: 'https://example.com/help' },
  ];
}
```

- Sidebar, Breadcrumb, and Stepper render real links (with the base href and location strategy), so middle and modified clicks open new tabs; a plain activation navigates with the router.
- Tabs navigate when a tab is selected (use `activation="manual"` so arrow keys do not navigate); Menu and Menu Bar navigate when an item is activated.
- Selection follows the URL after every navigation, back and forward included (path prefix by default; the longest match wins). A guard that rejects a navigation leaves the current item selected. The router owns the selection: do not bind `[(value)]` together with `auiRouterNav`.
- Items without `routerLink` keep their own `href` and behavior.

## Links as buttons

`a[auiButton]` styles a link as a button and keeps it a link: `href`, `target`, `RouterLink` (with query parameters and fragments), `routerLinkActive`, and middle clicks work. A disabled link gets `aria-disabled="true"`, leaves the tab order, and blocks activation, including router navigation.

```html
<a auiButton variant="primary" routerLink="/reports" [queryParams]="{ year: 2026 }" routerLinkActive="active">Reports</a>
<a auiButton routerLink="/admin" [disabled]="!isAdmin()">Admin</a>
```
