---
title: Testing
description: Test Angular screens that use AbsoluteUI with component harnesses for @angular/cdk/testing.
---

`@absoluteui/angular/testing` provides harnesses for `@angular/cdk/testing` (install `@angular/cdk` `^22`). Harnesses act through the rendered DOM as a user does and read what a user perceives, so tests keep passing when internals change.

```ts
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiTextInput } from '@absoluteui/angular/text-input';
import { AuiDialogHarness, AuiTextInputHarness } from '@absoluteui/angular/testing';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, AuiTextInput],
  template: `<aui-text-input label="Email" type="email" [formControl]="email" />`,
})
class ProfileComponent {
  readonly email = new FormControl('', { nonNullable: true, validators: [Validators.email] });
}

export async function checkEmailValidation(): Promise<void> {
  const fixture = TestBed.createComponent(ProfileComponent);
  const loader = TestbedHarnessEnvironment.loader(fixture);
  const email = await loader.getHarness(AuiTextInputHarness.with({ label: 'Email' }));
  await email.setValue('not-an-email');
  await email.blur();
  console.log(await email.getErrorMessage());

  // Dialogs render in the page's top layer: use the document root loader.
  const dialogs = TestbedHarnessEnvironment.documentRootLoader(fixture);
  const dialog = await dialogs.getHarnessOrNull(AuiDialogHarness.with({ title: 'Delete Ada?' }));
  await dialog?.clickAction('Delete');
}
```

| Harness | Selects | Main methods |
|---|---|---|
| `AuiButtonHarness` | `button[auiButton]`, `a[auiButton]`; `with({ text, variant })` | `getText`, `getVariant`, `isDisabled`, `isLoading`, `isLink`, `click` |
| `AuiTextInputHarness` | `<aui-text-input>`; `with({ label })` | field methods, `getValue`, `setValue` (typed key by key) |
| `AuiTextareaHarness`, `AuiNumberInputHarness` | `<aui-textarea>`, `<aui-number-input>` | field methods, `getValue`, `setValue`; Number Input `getText`, `setText`, `increment`, `decrement` |
| `AuiSelectHarness` | `<aui-select>` | field methods, `getValueText`, `open`, `close`, `isOpen`, `getOptions`, `selectOption` |
| `AuiComboboxHarness` | `<aui-combobox>` | field methods, `type`, `getInputText`, `isOpen`, `getOptionLabels`, `waitForOptions`, `selectOption` |
| `AuiMultiSelectHarness` | `<aui-multi-select>` | field methods, `type`, `open`, `close`, `isOpen`, `getOptionLabels`, `getSelectedLabels`, `toggleOption`, `removeValue` |
| `AuiCheckboxHarness`, `AuiSwitchHarness` | `<aui-checkbox>`, `<aui-switch>` | field methods, `isChecked`, `toggle`; Checkbox `check`, `uncheck`, `isIndeterminate` |
| `AuiRadioGroupHarness` | `<aui-radio-group>` | field methods, `getOptionLabels`, `getCheckedLabel`, `isOptionDisabled`, `select` |
| `AuiDatePickerHarness` | `<aui-date-picker>` | field methods, `getSegments`, `typeDate`, `openCalendar`, `getCalendarMonth`, `getDayLabels` (they name holidays and non-working days), `isDayDisabled`, `selectDay`, `nextMonth`, `previousMonth` |
| `AuiTabsHarness` | `<aui-tabs>`; `with({ label })` | `getTabLabels`, `getSelectedTabLabel`, `isTabDisabled`, `selectTab`, `getPanelText` |
| `AuiDialogHarness` | an open dialog; `with({ title })` | `getTitle`, `getDescription`, `getBodyText`, `getRole`, `getActionLabels`, `clickAction`, `getFocusedText`, `close`, `pressEscape` |
| `AuiDataTableHarness` | `<aui-data-table>`; `with({ caption })` | `getHeaders`, `getRows`, `getCellTexts`, `getSort`, `sortBy`, `search`, `editCell`, `getEditError`, `goToPage` |
| `AuiDataTableRowHarness`, `AuiDataTableHeaderHarness` | rows and column headers | `getCellTexts`, `isSelected`, `toggleSelection`, `isEditable`; `getText`, `getSortDirection`, `sort` |
| `AuiSidebarHarness` | `<aui-sidebar>`; `with({ label })` | `getItemLabels`, `getCurrentLabel`, `click`, `isGroupExpanded`, `isCollapsed`, `toggleCollapsed` |
| `AuiPaginationHarness` | `<aui-pagination>` | `getCurrentPage`, `getPageNumbers`, `isDisabled`, `goTo` |
| `AuiMenuHarness` | the trigger of `button[auiMenu]`; `with({ triggerText })` | `open`, `close`, `isOpen`, `getItems`, `select(...path)` |

Field methods: `getLabel`, `getDescription`, `getErrorMessage` (the message shown, including messages of Angular validators), `isRequired`, `isDisabled`, `isInvalid`, `focus`, `blur`. Field harnesses filter with `with({ label })`.

Data Table rows are rebuilt when an editor opens or a value is committed: query rows again after such actions (`editCell` on the table harness does this). Search is applied with Enter, because the table's typing delay runs outside Angular's stability tracking.

Full reference: [`@absoluteui/angular/testing`](/docs/angular/api/testing/).
