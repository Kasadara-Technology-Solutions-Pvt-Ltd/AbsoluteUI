---
title: Overlays
description: Dialogs, drawers, bottom sheets, popovers, tooltips, menus, and toasts in Angular - declarative components and services.
---

## Declarative overlays

`<aui-dialog>`, `<aui-drawer>`, `<aui-bottom-sheet>`, and `<aui-session-warning-dialog>` take their body as projected content. `[(open)]` opens and closes them and follows user dismissals (Escape, the close button, the backdrop, an action):

```html
<aui-dialog title="Delete file?" [(open)]="confirming" (closed)="onClosed($event.returnValue)">
  <p>This cannot be undone.</p>
</aui-dialog>
```

Focus trapping and restoration, Escape, the backdrop, and stacking come from the components. Modal overlays never open on the server.

## Dialog and drawer services

Open a component or a template from code with `AuiDialogService` or `AuiDrawerService` from `@absoluteui/angular/overlay`:

```ts
import { Component, inject } from '@angular/core';
import { AUI_DIALOG_DATA, AuiDialogRef, AuiDialogService } from '@absoluteui/angular/overlay';

interface User {
  name: string;
}

@Component({
  selector: 'app-edit-user',
  template: `<p>Editing {{ data.name }}</p><button type="button" (click)="save()">Save</button>`,
})
export class EditUserComponent {
  readonly data = inject<User>(AUI_DIALOG_DATA);
  readonly ref = inject<AuiDialogRef<User>>(AuiDialogRef);

  save(): void {
    this.ref.close({ name: this.data.name.trim() });
  }
}

@Component({
  selector: 'app-users',
  template: `<button type="button" (click)="edit()">Edit</button>`,
})
export class UsersComponent {
  readonly #dialogs = inject(AuiDialogService);

  async edit(): Promise<void> {
    const ref = this.#dialogs.open<User, User>(EditUserComponent, { title: 'Edit user', data: { name: 'Ada' }, size: 'md' });
    const { result } = await ref.closed;
    if (result) console.log('saved', result.name);
  }
}
```

- `open(content, config)`: `content` is a component type or a `TemplateRef` (template context: `let-data`, `let-ref="ref"`); `config` takes the Dialog or Drawer options (`title` is required) plus `data` and `injector` (the parent injector of the content; default the application root).
- `AuiDialogRef.close(result?)`; `closed` resolves once with `{ result, returnValue }` after the overlay closed and its content was destroyed. Dismissal by the user gives `result: undefined`; an action gives its value as `returnValue`.
- On the server nothing opens and `closed` resolves immediately.

## Popover, hover card, tooltip, and menus

These go on the trigger element:

```html
<button type="button" [auiPopover]="filters" popoverTitle="Filters">Filters</button>
<ng-template #filters>...</ng-template>

<button type="button" auiTooltip="Copy the link">Copy</button>
<button type="button" [auiMenu]="actions" (selected)="run($event)">Actions</button>
<section [auiContextMenu]="rowActions">...</section>
```

Methods: `open()`, `close()`, `toggle()` (Popover); `show()`, `hide()` (Tooltip, Hover Card); `open()`, `close()` (Menu, Context Menu).

## Toasts

```ts
import { Component, inject } from '@angular/core';
import { AuiToaster } from '@absoluteui/angular/toast';

@Component({
  selector: 'app-save',
  template: `<button type="button" (click)="save()">Save</button>`,
})
export class SaveComponent {
  readonly #toaster = inject(AuiToaster);

  save(): void {
    this.#toaster.show({ tone: 'success', message: 'Changes saved' });
  }
}
```

Configure position, maximum, and duration with `provideAuiToaster(...)`. `show()` returns `null` on the server.
