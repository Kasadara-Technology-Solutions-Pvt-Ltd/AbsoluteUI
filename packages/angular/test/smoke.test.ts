import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { duration, instant, plainDate, plainYearMonth, plainYearQuarter, resetAbsoluteUIConfig, type Duration, type PlainDate, type PlainYearMonth, type PlainYearQuarter, type Range } from '@absoluteui/core';
import type { DataTableColumn, DataTableFilterChangeDetail } from '@absoluteui/components/data-table';
import { AuiAccordion } from '../src/accordion/index.js';
import { AuiAlert } from '../src/alert/index.js';
import { AuiBarChart } from '../src/bar-chart/index.js';
import { AuiBreadcrumb } from '../src/breadcrumb/index.js';
import { AuiButtonGroup } from '../src/button-group/index.js';
import { AuiCalendar } from '../src/calendar/index.js';
import { AuiCard } from '../src/card/index.js';
import { AuiCheckbox } from '../src/checkbox/index.js';
import { AuiCheckboxGroup } from '../src/checkbox-group/index.js';
import { AuiCombobox } from '../src/combobox/index.js';
import { AuiDataTable, AuiDataTableColumnChooser } from '../src/data-table/index.js';
import { AuiDateInput } from '../src/date-input/index.js';
import { AuiDatePicker } from '../src/date-picker/index.js';
import { AuiDateRangePicker } from '../src/date-range-picker/index.js';
import { AuiDateTimePicker } from '../src/date-time-picker/index.js';
import { AuiDrawer } from '../src/drawer/index.js';
import { AuiDurationPicker } from '../src/duration-picker/index.js';
import { AuiErrorSummary } from '../src/error-summary/index.js';
import { AuiFormField } from '../src/form-field/index.js';
import { AuiInlineMessage } from '../src/inline-message/index.js';
import { AuiContainer, AuiFlex, AuiGrid } from '../src/layout/index.js';
import { AuiLineChart } from '../src/line-chart/index.js';
import { AuiMonthPicker } from '../src/month-picker/index.js';
import { AuiNumberInput } from '../src/number-input/index.js';
import { AuiPagination } from '../src/pagination/index.js';
import { AuiPieChart } from '../src/pie-chart/index.js';
import { AuiProgressBar } from '../src/progress-bar/index.js';
import { AuiQuarterPicker } from '../src/quarter-picker/index.js';
import { AuiRadioGroup } from '../src/radio-group/index.js';
import { AuiSkeleton } from '../src/skeleton/index.js';
import { AuiSparkline } from '../src/sparkline/index.js';
import { AuiSpinner } from '../src/spinner/index.js';
import { AuiSwitch } from '../src/switch/index.js';
import { AuiTextarea } from '../src/textarea/index.js';
import { AuiTimePicker } from '../src/time-picker/index.js';
import { AuiValidationMessage } from '../src/validation-message/index.js';
import { AuiYearPicker } from '../src/year-picker/index.js';
import { AuiFileUpload } from '../src/file-upload/index.js';
import { AuiUploadQueue } from '../src/upload-queue/index.js';
import { AuiPasswordInput } from '../src/password-input/index.js';
import { AuiOtpInput } from '../src/otp-input/index.js';
import { AuiPasswordStrengthMeter } from '../src/password-strength-meter/index.js';
import { AuiSessionWarningDialog } from '../src/session-warning-dialog/index.js';
import { AuiStepper } from '../src/stepper/index.js';
import { AuiMenuBar } from '../src/menu-bar/index.js';
import { AuiContextMenu } from '../src/context-menu/index.js';
import { AuiSidebar } from '../src/sidebar/index.js';
import { AuiHoverCard } from '../src/hover-card/index.js';
import { AuiBottomSheet } from '../src/bottom-sheet/index.js';
import { AuiSortableList } from '../src/sortable-list/index.js';
import { AuiChat } from '../src/chat/index.js';
import { AuiDiscussion } from '../src/discussion/index.js';
import { AuiPromptInput } from '../src/prompt-input/index.js';
import { AuiSchemaForm } from '../src/schema-form/index.js';
import { AuiFormBuilder } from '../src/form-builder/index.js';
import type { FormSchema } from '@absoluteui/components/schema-form';
import type { FormBuilderChangeDetail } from '@absoluteui/components/form-builder';
import type { ContextMenuSelectDetail } from '@absoluteui/components/context-menu';
import type { SortableListChangeDetail } from '@absoluteui/components/sortable-list';

// Every directive renders its component with minimal inputs (catches wiring errors
// in generated code that type checking cannot see, e.g. option names at runtime).
beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface Row {
  id: string;
  name: string;
}

@Component({
  imports: [
    ReactiveFormsModule, AuiAccordion, AuiAlert, AuiBreadcrumb, AuiButtonGroup, AuiCalendar, AuiCard, AuiCheckbox, AuiCheckboxGroup,
    AuiCombobox, AuiDataTable, AuiDateInput, AuiDatePicker, AuiDateTimePicker, AuiDrawer, AuiErrorSummary, AuiFormField, AuiInlineMessage,
    AuiContainer, AuiFlex, AuiGrid, AuiNumberInput, AuiPagination, AuiProgressBar, AuiRadioGroup, AuiSkeleton, AuiSpinner, AuiSwitch,
    AuiTextarea, AuiTimePicker, AuiValidationMessage, AuiLineChart, AuiBarChart, AuiPieChart, AuiSparkline,
  ],
  template: `
    <div auiContainer size="md">
      <div auiGrid [columns]="2" [gap]="4">
        <aui-accordion [items]="items"></aui-accordion>
        <aui-alert tone="warning" title="Heads up" message="Check your input."></aui-alert>
        <aui-breadcrumb [items]="crumbs"></aui-breadcrumb>
        <aui-button-group label="Actions" [buttons]="buttons"></aui-button-group>
        <aui-calendar [formControl]="day"></aui-calendar>
        <aui-card title="Card" content="Body"></aui-card>
        <aui-checkbox label="Agree" [formControl]="agree"></aui-checkbox>
        <aui-checkbox-group label="Topics" [options]="options" [formControl]="topics"></aui-checkbox-group>
        <aui-combobox label="Owner" [options]="options" [formControl]="owner"></aui-combobox>
        <aui-data-table caption="Rows" [columns]="columns" [rows]="rows" [rowId]="rowId"></aui-data-table>
        <aui-date-input label="Due" [formControl]="due"></aui-date-input>
        <aui-date-picker label="Start" [formControl]="start"></aui-date-picker>
        <aui-date-time-picker label="Meeting" [formControl]="meeting"></aui-date-time-picker>
        <aui-error-summary></aui-error-summary>
        <aui-form-field label="ZIP"><input [formControl]="zip" required></aui-form-field>
        <aui-inline-message message="Saved"></aui-inline-message>
        <div auiFlex [gap]="2" justify="between"><span>a</span><span>b</span></div>
        <aui-number-input label="Qty" [formControl]="qty"></aui-number-input>
        <aui-pagination [page]="2" [pageCount]="5"></aui-pagination>
        <aui-progress-bar label="Upload" [value]="40"></aui-progress-bar>
        <aui-radio-group label="Plan" [options]="options" [formControl]="plan"></aui-radio-group>
        <aui-skeleton [lines]="2"></aui-skeleton>
        <aui-spinner label="Loading"></aui-spinner>
        <aui-switch label="Notify" [formControl]="notify"></aui-switch>
        <aui-textarea label="Notes" [formControl]="notes"></aui-textarea>
        <aui-time-picker label="At" [formControl]="at"></aui-time-picker>
        <aui-validation-message message="Standalone"></aui-validation-message>
        <aui-line-chart label="Trend" [x]="months" [series]="chartSeries" (seriesToggled)="toggled = $event.id"></aui-line-chart>
        <aui-bar-chart label="Bars" [categories]="months" [series]="chartSeries" layout="stacked"></aui-bar-chart>
        <aui-pie-chart label="Share" [slices]="slices" [donut]="true"></aui-pie-chart>
        <aui-sparkline label="Spark" [values]="spark"></aui-sparkline>
      </div>
    </div>
    <aui-drawer title="Details" [open]="false"><p>Drawer</p></aui-drawer>
  `,
})
class AllHost {
  readonly items = [{ id: 'a', title: 'A', content: 'Alpha' }];
  readonly crumbs = [{ label: 'Home', href: '/' }, { label: 'Here' }];
  readonly buttons = [{ text: 'One', value: '1' }];
  readonly options = [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }];
  readonly columns = [{ id: 'name', header: 'Name', accessor: (r: Row) => r.name }];
  readonly rows: Row[] = [{ id: '1', name: 'Ada' }];
  readonly rowId = (r: Row): string => r.id;
  readonly day = new FormControl(plainDate(2026, 3, 18));
  readonly agree = new FormControl(true, { nonNullable: true });
  readonly topics = new FormControl<string[]>(['y'], { nonNullable: true });
  readonly owner = new FormControl<string | null>('x');
  readonly due = new FormControl(plainDate(2026, 5, 1));
  readonly start = new FormControl(plainDate(2026, 5, 2));
  readonly meeting = new FormControl(null);
  readonly zip = new FormControl('', { nonNullable: true });
  readonly qty = new FormControl<number | null>(3);
  readonly plan = new FormControl<string | null>('y');
  readonly notify = new FormControl(false, { nonNullable: true });
  readonly notes = new FormControl('hello', { nonNullable: true });
  readonly at = new FormControl(null);
  readonly months = ['Jan', 'Feb'];
  readonly chartSeries = [{ id: 'a', label: 'A', values: [1, 2] }, { id: 'b', label: 'B', values: [3, null] }];
  readonly slices = [{ id: 'x', label: 'X', value: 2 }, { id: 'y', label: 'Y', value: 1 }];
  readonly spark = [1, 3, 2];
  toggled = '';
}

describe('Angular adapter: every directive renders', () => {
  it('creates each component with model values written through', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(AllHost);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const expected = [
      'aui-accordion', 'aui-alert', 'aui-breadcrumb', 'aui-calendar', 'aui-card', 'aui-checkbox', 'aui-checkbox-group', 'aui-combobox',
      'aui-data-table', 'aui-date-input', 'aui-date-picker', 'aui-date-time-picker', 'aui-error-summary', 'aui-form-field',
      'aui-inline-message', 'aui-number-input', 'aui-pagination', 'aui-progress-bar', 'aui-radio-group', 'aui-skeleton', 'aui-spinner',
      'aui-switch', 'aui-textarea', 'aui-time-picker', 'aui-validation-message', 'aui-container', 'aui-grid', 'aui-flex',
      'aui-line-chart', 'aui-bar-chart', 'aui-pie-chart', 'aui-sparkline',
    ];
    const missing = expected.filter((c) => !el.querySelector(`.${c}`));
    expect(missing).toEqual([]);
    expect(el.querySelector<HTMLInputElement>('.aui-checkbox input')!.checked).toBe(true);
    expect(el.querySelector<HTMLTextAreaElement>('.aui-textarea textarea')!.value).toBe('hello');
    expect(el.querySelector('.aui-combobox input')).toHaveProperty('value', 'X');
    expect(el.querySelector('[role="radiogroup"] input:checked')).toHaveProperty('value', 'y');
    expect(el.querySelector('.aui-alert')!.hasAttribute('title')).toBe(false);
    expect(document.querySelector('dialog.aui-drawer')).not.toBeNull();
    // Chart outputs carry the event detail (legend toggle).
    el.querySelector<HTMLButtonElement>('.aui-line-chart .aui-chart__legend-item')!.click();
    expect(fixture.componentInstance.toggled).toBe('a');
    expect(el.querySelector('.aui-pie-chart__center')!.textContent).toBe('3');
    fixture.destroy();
    expect(document.querySelector('dialog.aui-drawer')).toBeNull();
  });
});

@Component({
  imports: [ReactiveFormsModule, AuiDateRangePicker, AuiMonthPicker, AuiYearPicker, AuiQuarterPicker, AuiDurationPicker],
  template: `
    <aui-date-range-picker label="Stay" [months]="1" [minDays]="2" [formControl]="stay"></aui-date-range-picker>
    <aui-month-picker label="Month" [formControl]="month"></aui-month-picker>
    <aui-year-picker label="Year" [required]="true" [formControl]="year"></aui-year-picker>
    <aui-quarter-picker label="Quarter" [formControl]="quarter"></aui-quarter-picker>
    <aui-duration-picker label="Estimate" [fields]="['hours', 'minutes']" [step]="step" [formControl]="estimate"></aui-duration-picker>
  `,
})
class PickersHost {
  readonly step = duration(15 * 60_000);
  readonly stay = new FormControl<Range<PlainDate> | null>({ start: plainDate(2026, 3, 5), end: plainDate(2026, 3, 8) });
  readonly month = new FormControl<PlainYearMonth | null>(plainYearMonth(2026, 3));
  readonly year = new FormControl<number | null>(null);
  readonly quarter = new FormControl<PlainYearQuarter | null>(plainYearQuarter(2026, 2));
  readonly estimate = new FormControl<Duration | null>(duration(90 * 60_000));
}

describe('Angular adapter: R2 pickers', () => {
  it('write model values, report validity, and propagate user changes', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PickersHost);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    const segments = (selector: string): string[] => Array.from(el.querySelectorAll<HTMLInputElement>(`${selector} input:not([type="hidden"])`)).map((i) => i.value);
    expect(segments('.aui-date-range-picker')).toEqual(['03', '05', '2026', '03', '08', '2026']);
    expect(segments('.aui-month-picker')).toEqual(['03', '2026']);
    expect(segments('.aui-quarter-picker')).toEqual(['2', '2026']);
    expect(segments('.aui-duration-picker')).toEqual(['1', '30']);
    // Component validity reaches Angular (error key `aui`).
    expect(host.year.errors).toMatchObject({ aui: { error: 'value-missing' } });
    host.stay.setValue({ start: plainDate(2026, 3, 5), end: plainDate(2026, 3, 5) });
    await fixture.whenStable();
    expect(host.stay.errors).toMatchObject({ aui: { error: 'range-too-short' } });
    // User changes update the model.
    const minutes = el.querySelector<HTMLInputElement>('.aui-duration-picker [aria-label="Minutes"]')!;
    await userEvent.click(minutes);
    await userEvent.keyboard('{ArrowUp}');
    expect(host.estimate.value?.milliseconds).toBe(105 * 60_000);
    const year = el.querySelector<HTMLInputElement>('.aui-year-picker input:not([type="hidden"])')!;
    await userEvent.click(year);
    await userEvent.keyboard('2031');
    expect(host.year.value).toBe(2031);
    expect(host.year.valid).toBe(true);
    host.month.disable();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('.aui-month-picker input:not([type="hidden"])')!.disabled).toBe(true);
    fixture.destroy();
  });
});

@Component({
  imports: [ReactiveFormsModule, AuiFileUpload, AuiUploadQueue, AuiPasswordInput, AuiOtpInput, AuiPasswordStrengthMeter, AuiSessionWarningDialog],
  template: `
    <aui-file-upload label="Attachments" [multiple]="true" [formControl]="files"></aui-file-upload>
    <aui-upload-queue label="Uploads" [upload]="upload"></aui-upload-queue>
    <aui-password-input label="Password" autocomplete="new-password" [formControl]="password"></aui-password-input>
    <aui-password-strength-meter [value]="password.value"></aui-password-strength-meter>
    <aui-otp-input label="Code" [length]="4" [formControl]="code"></aui-otp-input>
    <aui-session-warning-dialog [expiresAt]="expiresAt" [open]="false"><p>Unsaved work is kept.</p></aui-session-warning-dialog>
  `,
})
class R2Host {
  readonly files = new FormControl<File[]>([new File(['x'], 'a.txt')], { nonNullable: true });
  readonly password = new FormControl('abcDEF123456', { nonNullable: true });
  readonly code = new FormControl('12', { nonNullable: true });
  readonly expiresAt = instant(Date.now() + 600_000);
  readonly upload = (): Promise<null> => Promise.resolve(null);
}

describe('Angular adapter: R2 upload and auth directives render', () => {
  it('creates each component with model values written through', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(R2Host);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const missing = ['aui-file-upload', 'aui-upload-queue', 'aui-password-input', 'aui-password-strength-meter', 'aui-otp-input'].filter((c) => !el.querySelector(`.${c}`));
    expect(missing).toEqual([]);
    expect(el.querySelector('.aui-file-upload__name')!.textContent).toBe('a.txt');
    expect(el.querySelector<HTMLInputElement>('.aui-password-input input')!.value).toBe('abcDEF123456');
    expect(el.querySelector('.aui-password-strength-meter__rating')!.textContent).toBe('Good');
    expect(el.querySelector<HTMLInputElement>('.aui-otp-input input')!.value).toBe('12');
    // The OTP Validator reports the incomplete code to Angular.
    expect(fixture.componentInstance.code.errors).toEqual({ aui: { error: 'too-short', message: 'Enter all 4 digits.' } });
    expect(document.querySelector('dialog.aui-session-warning-dialog')!.textContent).toContain('Unsaved work is kept.');
    fixture.destroy();
    expect(document.querySelector('dialog.aui-session-warning-dialog')).toBeNull();
  });
});

interface Person {
  id: string;
  name: string;
  age: number;
}

// Since 0.3.0: grid inputs and outputs on the generic directive, plus the column chooser directive
// (declared before the table it controls, which is created later in the same render).
@Component({
  imports: [AuiDataTable, AuiDataTableColumnChooser],
  template: `
    <button type="button" [auiDataTableColumnChooser]="grid" #chooser="auiDataTableColumnChooser">Columns</button>
    <aui-data-table #grid="auiDataTable" caption="People" [columns]="columns" [rows]="rows" [rowId]="rowId"
      [multiSort]="true" [searchable]="true" [filterDelay]="0" [hiddenColumns]="hidden()" [pinnedColumns]="{ start: ['name'] }"
      (filterChange)="onFilter($event)" (columnsChange)="reasons.push($event.reason)"></aui-data-table>
  `,
})
class GridHost {
  readonly columns: DataTableColumn<Person>[] = [
    { id: 'name', header: 'Name', accessor: (p) => p.name, filter: 'text' },
    { id: 'age', header: 'Age', accessor: (p) => p.age, type: 'number', filter: 'number' },
  ];
  readonly rows: Person[] = [{ id: '1', name: 'Ada', age: 36 }, { id: '2', name: 'Grace', age: 45 }];
  readonly rowId = (p: Person): string => p.id;
  readonly hidden = signal<string[]>([]);
  readonly filters: DataTableFilterChangeDetail[] = [];
  readonly reasons: string[] = [];
  onFilter(detail: DataTableFilterChangeDetail): void {
    this.filters.push(detail);
  }
}

describe('Angular adapter: Data Table grid features', () => {
  it('binds grid inputs and outputs and attaches the column chooser', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GridHost);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    await Promise.resolve();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    const search = el.querySelector<HTMLInputElement>('.aui-data-table__search-input')!;
    await userEvent.fill(search, 'grace');
    expect(host.filters).toEqual([{ filters: {}, search: 'grace' }]);
    expect(el.querySelectorAll('tbody .aui-data-table__row')).toHaveLength(1);
    expect(el.querySelector('thead th[data-column="name"]')!.classList.contains('aui-data-table__cell--pinned-start')).toBe(true);
    const button = el.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    expect(button.textContent).toBe('Columns');
    await userEvent.click(button);
    const items = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'));
    expect(items.map((i) => i.textContent)).toEqual(['Name', 'Age']);
    await userEvent.click(items[1]!);
    expect(host.reasons).toEqual(['visibility']);
    expect(el.querySelector('thead th[data-column="age"]')).toBeNull();
    host.hidden.set([]);
    await fixture.whenStable();
    expect(el.querySelector('thead th[data-column="age"]')).not.toBeNull();
    fixture.destroy();
    expect(button.hasAttribute('aria-haspopup')).toBe(false);
  });
});
@Component({
  imports: [AuiStepper, AuiMenuBar, AuiContextMenu, AuiSidebar, AuiHoverCard, AuiBottomSheet, AuiSortableList],
  template: `
    <aui-sidebar label="Main" [items]="nav" value="home" [breakpoint]="0"></aui-sidebar>
    <aui-stepper label="Checkout" [steps]="steps" value="b" (changed)="step = $event.value"></aui-stepper>
    <aui-menu-bar label="Editor" [items]="bar" (selected)="picked = $event.id"></aui-menu-bar>
    <div class="files" [auiContextMenu]="actions" contextMenuLabel="File actions" (selected)="onAction($event)"><button type="button">a.txt</button></div>
    <a href="#ada" [auiHoverCard]="card" [hoverCardShowDelay]="0">Ada</a>
    <ng-template #card><p class="card-body">{{ bio }}</p></ng-template>
    <aui-bottom-sheet title="Share" [open]="sheetOpen" [snapPoints]="[0.5, 1]"><p class="sheet-body">Sheet</p></aui-bottom-sheet>
    <aui-sortable-list label="Priorities" [items]="priorities" (changed)="onOrder($event)"></aui-sortable-list>
  `,
})
class NavHost {
  readonly nav = [{ id: 'home', label: 'Home', href: '#home' }, { type: 'group' as const, id: 'g', label: 'Reports', items: [{ id: 'sales', label: 'Sales' }] }];
  readonly steps = [{ id: 'a', label: 'A', status: 'complete' as const }, { id: 'b', label: 'B' }];
  readonly bar = [{ id: 'file', label: 'File', items: [{ id: 'new', label: 'New' }] }, { id: 'help', label: 'Help' }];
  readonly actions = [{ id: 'open', label: 'Open' }];
  readonly priorities = [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }];
  readonly bio = 'Mathematician';
  sheetOpen = false;
  step = '';
  picked = '';
  action = '';
  order: string[] = [];

  onAction(detail: ContextMenuSelectDetail): void {
    this.action = `${detail.id}:${detail.origin.textContent}`;
  }

  onOrder(detail: SortableListChangeDetail): void {
    this.order = detail.order;
  }
}

describe('Angular adapter: R2 navigation and overlay directives', () => {
  it('render, forward outputs, and clean up', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(NavHost);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    const missing = ['aui-sidebar', 'aui-stepper', 'aui-menu-bar', 'aui-sortable-list'].filter((c) => !el.querySelector(`.${c}`));
    expect(missing).toEqual([]);

    el.querySelector<HTMLButtonElement>('.aui-stepper__control')!.click();
    expect(host.step).toBe('a');
    el.querySelector<HTMLButtonElement>('.aui-menu-bar__item[data-id="help"]')!.click();
    expect(host.picked).toBe('help');

    const file = el.querySelector<HTMLButtonElement>('.files button')!;
    file.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
    const menu = document.querySelector<HTMLElement>('.aui-menu--context')!;
    expect(menu.matches(':popover-open')).toBe(true);
    menu.querySelector<HTMLElement>('.aui-menu__item')!.click();
    expect(host.action).toBe('open:a.txt');

    // The hover card body is a live embedded view.
    expect(document.querySelector('.aui-hover-card .card-body')?.textContent).toBe('Mathematician');
    const sheet = document.querySelector<HTMLDialogElement>('dialog.aui-bottom-sheet')!;
    expect(sheet.querySelector('.sheet-body')).not.toBeNull();
    expect(sheet.open).toBe(false);

    const handle = el.querySelector<HTMLButtonElement>('.aui-sortable-list__handle')!;
    handle.focus();
    await userEvent.keyboard(' {ArrowDown} ');
    expect(host.order).toEqual(['y', 'x']);

    fixture.destroy();
    expect(document.querySelector('dialog.aui-bottom-sheet, .aui-hover-card, .aui-menu')).toBeNull();
  });
});

@Component({
  imports: [ReactiveFormsModule, AuiChat, AuiPromptInput],
  template: `
    <aui-chat label="Assistant" [messages]="messages" [composer]="false" (feedbackGiven)="rated = $event.value"></aui-chat>
    <aui-prompt-input label="Message" [formControl]="draft" (sent)="sent = $event.text"></aui-prompt-input>
  `,
})
class ChatHost {
  readonly messages = [{ id: '1', role: 'user' as const, text: 'Hello' }, { id: '2', role: 'assistant' as const, text: 'Hi **there**' }];
  readonly draft = new FormControl('first draft', { nonNullable: true });
  rated: string | null = '';
  sent = '';
}

describe('Angular adapter: R20 chat directives', () => {
  it('render messages, bind the composer value, and forward outputs', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ChatHost);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    expect(el.querySelectorAll('.aui-chat article')).toHaveLength(2);
    expect(el.querySelector('.aui-chat article strong')!.textContent).toBe('there');
    const textarea = el.querySelector<HTMLTextAreaElement>('.aui-prompt-input textarea')!;
    expect(textarea.value).toBe('first draft');
    el.querySelector<HTMLButtonElement>('.aui-chat__helpful')!.click();
    expect(host.rated).toBe('up');
    el.querySelector<HTMLButtonElement>('.aui-prompt-input__send')!.click();
    expect(host.sent).toBe('first draft');
    fixture.destroy();
  });
});

@Component({
  imports: [AuiDiscussion],
  template: `<aui-discussion label="Comments" [currentUser]="me" [comments]="comments" [(sort)]="sort" (deleted)="deleted = $event.comment.id"></aui-discussion>`,
})
class DiscussionHost {
  readonly me = { id: 'ada', name: 'Ada Lovelace' };
  readonly comments = [
    { id: '1', parentId: null, author: { id: 'grace', name: 'Grace Hopper' }, text: 'First', createdAt: instant(Date.now() - 600_000) },
    { id: '2', parentId: '1', author: { id: 'ada', name: 'Ada Lovelace' }, text: 'Reply', createdAt: instant(Date.now() - 300_000) },
  ];
  sort: 'oldest' | 'newest' | undefined = 'oldest';
  deleted = '';
}

describe('Angular adapter: R20 discussion', () => {
  it('renders nested comments, syncs the sort model, and forwards outputs', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(DiscussionHost);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    expect(el.querySelectorAll('.aui-discussion article')).toHaveLength(2);
    expect(el.querySelector('.aui-discussion__replies article')!.getAttribute('aria-label')).toMatch(/^Reply by Ada Lovelace to Grace Hopper/);
    [...el.querySelectorAll<HTMLButtonElement>('.aui-discussion__sort button')].find((b) => b.textContent === 'Newest')!.click();
    expect(host.sort).toBe('newest');
    el.querySelector<HTMLButtonElement>('.aui-discussion__action--delete')!.click();
    el.querySelector<HTMLButtonElement>('.aui-discussion__confirm-delete')!.click();
    expect(host.deleted).toBe('2');
    fixture.destroy();
  });
});

@Component({
  imports: [AuiSchemaForm, AuiFormBuilder],
  template: `
    <aui-schema-form [schema]="schema" [value]="value" submitLabel="Send" (submitted)="sent = $event.value"></aui-schema-form>
    <aui-form-builder label="Designer" [schema]="schema" (changed)="doc = $event"></aui-form-builder>
  `,
})
class GeneratedFormsHost {
  readonly schema: FormSchema = { type: 'object', title: 'Feedback', required: ['name'], properties: { name: { type: 'string', title: 'Name' } } };
  readonly value = { name: 'Ada' };
  sent: unknown = null;
  doc: FormBuilderChangeDetail | null = null;
}

describe('Angular adapter: R20 Schema Form and Form Builder', () => {
  it('render, forward outputs, and clean up', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(GeneratedFormsHost);
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    expect(['aui-schema-form', 'aui-form-builder'].filter((c) => !el.querySelector(`.${c}`))).toEqual([]);
    el.querySelector<HTMLButtonElement>('.aui-schema-form button[type="submit"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.sent).toEqual({ name: 'Ada' });
    el.querySelector<HTMLButtonElement>('.aui-form-builder__type')!.click();
    expect(Object.keys(host.doc?.schema.properties ?? {})).toEqual(['name', 'text1']);
    fixture.destroy();
    expect(el.querySelector('.aui-schema-form')).toBeNull();
  });
});
