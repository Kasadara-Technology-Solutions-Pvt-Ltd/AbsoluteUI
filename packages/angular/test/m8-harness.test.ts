/* eslint-disable @typescript-eslint/unbound-method -- Angular validators are static functions passed by reference */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { plainDate, plainDateToString, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import type { DataTableCellEditDetail } from '@absoluteui/components/data-table';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiButton } from '../src/button/index.js';
import { AUI_DATA_TABLE } from '../src/data-table/index.js';
import { AuiDatePicker } from '../src/date-picker/index.js';
import { AuiDialogService } from '../src/overlay/index.js';
import { AuiSelect } from '../src/select/index.js';
import { AuiTabs } from '../src/tabs/index.js';
import { AuiTextInput } from '../src/text-input/index.js';
import { AuiButtonHarness, AuiDataTableHarness, AuiDatePickerHarness, AuiDialogHarness, AuiSelectHarness, AuiTabsHarness, AuiTextInputHarness } from '../src/testing/index.js';

// docs/PLAN-R9-ANGULAR.md M8a (D23): harnesses, driven only through the DOM.
beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {
    // Already initialized by another test file in the same run.
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-GB', timezone: 'UTC' })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

@Component({ template: '<p>The row is removed.</p>' })
class DialogBody {
  readonly kind = 'body';
}

interface Row {
  id: string;
  name: string;
  hours: number;
}

@Component({
  imports: [ReactiveFormsModule, AuiButton, AuiTextInput, AuiSelect, AuiDatePicker, AuiTabs, ...AUI_DATA_TABLE],
  template: `
    <aui-text-input label="Email" description="Work address." [formControl]="email" />
    <aui-select label="Team" [options]="teams" [formControl]="team" />
    <aui-date-picker label="Start" [formControl]="start" [businessCalendar]="calendar" disableNonWorking />
    <aui-tabs label="Views" [tabs]="tabs" />
    <button type="button" auiButton variant="danger" (click)="confirm()">Delete</button>
    <button type="button" auiButton [loading]="true">Saving</button>
    <aui-data-table caption="People" [rows]="rows()" [rowId]="byId" selection="multiple" searchable [pageSize]="2" (cellEdit)="edit($event)">
      <aui-column field="name" header="Name" rowHeader sortable />
      <aui-column field="hours" header="Hours" type="number" sortable editable [validate]="hoursRule" />
    </aui-data-table>
  `,
})
class Host {
  readonly #dialogs = inject(AuiDialogService);
  readonly email = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });
  readonly team = new FormControl<string | null>(null);
  readonly start = new FormControl<PlainDate | null>(plainDate(2026, 11, 2));
  readonly calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 11, 11), name: 'Founders day' }] });
  readonly teams = [
    { value: 'core', label: 'Core' },
    { value: 'web', label: 'Web', description: 'Front end' },
    { value: 'ops', label: 'Ops', disabled: true },
  ];
  readonly tabs = [
    { id: 'a', label: 'Summary', content: 'Summary panel' },
    { id: 'b', label: 'Details', content: 'Details panel' },
    { id: 'c', label: 'Archive', content: 'Archive panel', disabled: true },
  ];
  readonly rows = signal<readonly Row[]>([
    { id: 'r1', name: 'Lin', hours: 5 },
    { id: 'r2', name: 'Ada', hours: 3 },
    { id: 'r3', name: 'Grace', hours: 8 },
  ]);
  readonly byId = (r: Row): string => r.id;
  readonly hoursRule = (value: unknown): string | null => (typeof value === 'number' && value <= 40 ? null : 'At most 40.');
  readonly result = signal<string | null>(null);
  edit(e: DataTableCellEditDetail<Row>): void {
    if (typeof e.value === 'number') {
      const hours = e.value;
      this.rows.update((all) => all.map((r) => (r.id === e.rowId ? { ...r, hours } : r)));
    }
  }
  async confirm(): Promise<void> {
    const ref = this.#dialogs.open(DialogBody, { title: 'Delete Ada?', description: 'This cannot be undone.', role: 'alertdialog', actions: [{ label: 'Cancel', value: 'cancel', autofocus: true }, { label: 'Delete', value: 'delete', variant: 'danger' }] });
    this.result.set((await ref.closed).returnValue);
  }
}

describe('harnesses (M8a)', () => {
  it('Text Input: label, description, typing, Angular validator messages, required', async () => {
    const f = await render(Host);
    const loader = TestbedHarnessEnvironment.loader(f);
    const email = await loader.getHarness(AuiTextInputHarness.with({ label: 'Email' }));
    expect(await email.getLabel()).toBe('Email');
    expect(await email.getDescription()).toBe('Work address.');
    expect(await email.isRequired()).toBe(true);
    await email.setValue('not-an-email');
    await email.blur();
    expect(await email.getErrorMessage()).toMatch(/email/i);
    expect(await email.isInvalid()).toBe(true);
    await email.setValue('ada@example.com');
    expect(f.componentInstance.email.value).toBe('ada@example.com');
    expect(await email.getErrorMessage()).toBeNull();
  });

  it('Select: options with state, choose by label', async () => {
    const f = await render(Host);
    const team = await TestbedHarnessEnvironment.loader(f).getHarness(AuiSelectHarness.with({ label: 'Team' }));
    expect(await team.getOptions()).toEqual([
      { label: 'Core', disabled: false, selected: false },
      { label: 'Web', disabled: false, selected: false },
      { label: 'Ops', disabled: true, selected: false },
    ]);
    await team.selectOption('Web');
    expect(f.componentInstance.team.value).toBe('web');
    expect(await team.getValueText()).toBe('Web');
    expect(await team.isOpen()).toBe(false);
  });

  it('Date Picker: segments, typing a date, calendar with business days', async () => {
    const f = await render(Host);
    const start = await TestbedHarnessEnvironment.loader(f).getHarness(AuiDatePickerHarness.with({ label: 'Start' }));
    expect(await start.getSegments()).toEqual(['02', '11', '2026']);
    expect(await start.getCalendarMonth()).toBe('November 2026');
    const labels = await start.getDayLabels();
    expect(labels).toContain('Wednesday, 11 November 2026, Founders day, non-working day');
    expect(labels.find((l) => l.startsWith('Saturday, 7 November'))).toMatch(/non-working/);
    expect(await start.isDayDisabled(7)).toBe(true);
    await start.selectDay(12);
    expect(plainDateToString(f.componentInstance.start.value ?? plainDate(1, 1, 1))).toBe('2026-11-12');
    await start.typeDate({ year: 2026, month: 12, day: 1 });
    expect(plainDateToString(f.componentInstance.start.value ?? plainDate(1, 1, 1))).toBe('2026-12-01');
  });

  it('Tabs: labels, selection, disabled, panel', async () => {
    const f = await render(Host);
    const tabs = await TestbedHarnessEnvironment.loader(f).getHarness(AuiTabsHarness.with({ label: 'Views' }));
    expect(await tabs.getTabLabels()).toEqual(['Summary', 'Details', 'Archive']);
    expect(await tabs.getSelectedTabLabel()).toBe('Summary');
    expect(await tabs.isTabDisabled('Archive')).toBe(true);
    await tabs.selectTab('Details');
    expect(await tabs.getSelectedTabLabel()).toBe('Details');
    expect(await tabs.getPanelText()).toBe('Details panel');
  });

  it('Button and Dialog: variant, loading, alert dialog through the document root loader', async () => {
    const f = await render(Host);
    const loader = TestbedHarnessEnvironment.loader(f);
    const del = await loader.getHarness(AuiButtonHarness.with({ text: 'Delete', variant: 'danger' }));
    const saving = await loader.getHarness(AuiButtonHarness.with({ text: /Saving/ }));
    expect(await saving.isLoading()).toBe(true);
    expect(await saving.isDisabled()).toBe(true);
    expect(await del.isLink()).toBe(false);
    await del.click();
    const dialog = await TestbedHarnessEnvironment.documentRootLoader(f).getHarness(AuiDialogHarness.with({ title: 'Delete Ada?' }));
    expect(await dialog.getRole()).toBe('alertdialog');
    expect(await dialog.getDescription()).toBe('This cannot be undone.');
    expect(await dialog.getBodyText()).toBe('The row is removed.');
    expect(await dialog.getActionLabels()).toEqual(['Cancel', 'Delete']);
    expect(await dialog.getFocusedText()).toBe('Cancel');
    await dialog.clickAction('Delete');
    await f.whenStable();
    expect(f.componentInstance.result()).toBe('delete');
    expect(await TestbedHarnessEnvironment.documentRootLoader(f).getAllHarnesses(AuiDialogHarness)).toHaveLength(0);
  });

  it('Data Table: headers, rows, sort, search, selection, editing with validation, paging', async () => {
    const f = await render(Host);
    const table = await TestbedHarnessEnvironment.loader(f).getHarness(AuiDataTableHarness.with({ caption: 'People' }));
    expect((await table.getHeaderTexts()).filter((h) => h !== '')).toEqual(['Name', 'Hours']);
    expect((await table.getCellTexts()).map((r) => r.filter((c) => c !== ''))).toEqual([['Lin', '5'], ['Ada', '3']]);
    await table.sortBy('Name');
    expect(await table.getSort()).toEqual({ column: 'Name', direction: 'ascending' });
    expect((await table.getCellTexts()).map((r) => r.find((c) => c !== ''))).toEqual(['Ada', 'Grace']);
    await table.goToPage('next');
    expect((await table.getCellTexts()).map((r) => r.find((c) => c !== ''))).toEqual(['Lin']);
    await table.goToPage(1);
    const [first] = await table.getRows();
    if (!first) throw new Error('no row');
    await first.toggleSelection();
    expect(await first.isSelected()).toBe(true);
    expect(await first.isEditable('hours')).toBe(true);
    expect(await table.editCell(0, 'hours', '99')).toBe('At most 40.');
    expect(await table.editCell(0, 'hours', '7')).toBeNull();
    expect(f.componentInstance.rows().find((r) => r.id === 'r2')?.hours).toBe(7);
    await table.search('gra');
    expect((await table.getCellTexts()).map((r) => r.find((c) => c !== ''))).toEqual(['Grace']);
  });
});
