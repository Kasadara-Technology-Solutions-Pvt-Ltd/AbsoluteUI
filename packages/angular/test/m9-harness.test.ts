import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { ComboboxOption } from '@absoluteui/components/combobox';
import type { MenuItem, MenuSelectDetail } from '@absoluteui/components/menu';
import type { SidebarItem } from '@absoluteui/components/sidebar';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiCheckbox } from '../src/checkbox/index.js';
import { AuiCombobox } from '../src/combobox/index.js';
import { AuiMenu } from '../src/menu/index.js';
import { AuiNumberInput } from '../src/number-input/index.js';
import { AuiPagination } from '../src/pagination/index.js';
import { AuiRadioGroup } from '../src/radio-group/index.js';
import { AuiSidebar } from '../src/sidebar/index.js';
import { AuiSwitch } from '../src/switch/index.js';
import { AuiTextarea } from '../src/textarea/index.js';
import {
  AuiCheckboxHarness,
  AuiComboboxHarness,
  AuiMenuHarness,
  AuiNumberInputHarness,
  AuiPaginationHarness,
  AuiRadioGroupHarness,
  AuiSidebarHarness,
  AuiSwitchHarness,
  AuiTextareaHarness,
} from '../src/testing/index.js';

// docs/PLAN-R9-ANGULAR.md M9 (D31): harnesses for the remaining common controls.
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
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

@Component({
  imports: [ReactiveFormsModule, AuiCheckbox, AuiSwitch, AuiRadioGroup, AuiTextarea, AuiNumberInput, AuiCombobox, AuiSidebar, AuiPagination, AuiMenu],
  template: `
    <aui-checkbox label="Accept terms" [formControl]="terms" />
    <aui-switch label="Notifications" [formControl]="notify" />
    <aui-radio-group label="Plan" [options]="plans" [formControl]="plan" />
    <aui-textarea label="Notes" [formControl]="notes" />
    <aui-number-input label="Seats" [formControl]="seats" [min]="1" [max]="5" />
    <aui-combobox label="Manager" [options]="managers()" [loadOptions]="search" [formControl]="manager" />
    <aui-sidebar label="Main" [items]="nav" [breakpoint]="0" />
    <aui-pagination [total]="50" [pageSize]="10" [(page)]="page" />
    <button type="button" [auiMenu]="menu" (selected)="chosen.set($event)">Actions</button>
  `,
})
class Host {
  readonly terms = new FormControl(false, { nonNullable: true });
  readonly notify = new FormControl(true, { nonNullable: true });
  readonly plan = new FormControl<string | null>('basic');
  readonly notes = new FormControl('', { nonNullable: true });
  readonly seats = new FormControl<number | null>(2);
  readonly manager = new FormControl<string | null>(null);
  readonly managers = signal<readonly ComboboxOption[]>([]);
  readonly plans = [
    { value: 'basic', label: 'Basic' },
    { value: 'pro', label: 'Pro' },
    { value: 'max', label: 'Max', disabled: true },
  ];
  readonly search = (query: string): Promise<ComboboxOption[]> =>
    Promise.resolve([{ value: 'ada', label: 'Ada Lovelace' }, { value: 'grace', label: 'Grace Hopper' }].filter((o) => o.label.toLowerCase().includes(query.toLowerCase())));
  readonly nav: readonly SidebarItem[] = [
    { id: 'home', label: 'Home' },
    { type: 'group', id: 'reports', label: 'Reports', items: [{ id: 'annual', label: 'Annual' }] },
  ];
  readonly page = signal<number | undefined>(1);
  readonly menu: readonly MenuItem[] = [
    { id: 'copy', label: 'Copy' },
    { id: 'more', label: 'More', items: [{ id: 'archive', label: 'Archive' }] },
    { type: 'checkbox', id: 'pin', label: 'Pinned', checked: false },
  ];
  readonly chosen = signal<MenuSelectDetail | null>(null);
}

describe('harnesses for more controls (M9)', () => {
  it('Checkbox, Switch, Radio Group, Textarea, Number Input', async () => {
    const f = await render(Host);
    const host = f.componentInstance;
    const loader = TestbedHarnessEnvironment.loader(f);
    const terms = await loader.getHarness(AuiCheckboxHarness.with({ label: 'Accept terms' }));
    await terms.check();
    expect(host.terms.value).toBe(true);
    expect(await terms.isChecked()).toBe(true);
    const notify = await loader.getHarness(AuiSwitchHarness.with({ label: 'Notifications' }));
    expect(await notify.isChecked()).toBe(true);
    await notify.toggle();
    expect(host.notify.value).toBe(false);
    const plan = await loader.getHarness(AuiRadioGroupHarness.with({ label: 'Plan' }));
    expect(await plan.getOptionLabels()).toEqual(['Basic', 'Pro', 'Max']);
    expect(await plan.getCheckedLabel()).toBe('Basic');
    expect(await plan.isOptionDisabled('Max')).toBe(true);
    await plan.select('Pro');
    expect(host.plan.value).toBe('pro');
    const notes = await loader.getHarness(AuiTextareaHarness.with({ label: 'Notes' }));
    await notes.setValue('Line one');
    expect(host.notes.value).toBe('Line one');
    const seats = await loader.getHarness(AuiNumberInputHarness.with({ label: 'Seats' }));
    expect(await seats.getValue()).toBe(2);
    await seats.increment();
    expect(host.seats.value).toBe(3);
    await seats.setText('9');
    expect(await seats.isInvalid()).toBe(true);
  });

  it('Combobox: async options and choosing', async () => {
    const f = await render(Host);
    const manager = await TestbedHarnessEnvironment.loader(f).getHarness(AuiComboboxHarness.with({ label: 'Manager' }));
    await manager.type('gra');
    expect(await manager.waitForOptions()).toEqual(['Grace Hopper']);
    await manager.selectOption('Grace Hopper');
    expect(f.componentInstance.manager.value).toBe('grace');
    expect(await manager.getInputText()).toBe('Grace Hopper');
  });

  it('Sidebar, Pagination, Menu (with a submenu)', async () => {
    const f = await render(Host);
    const loader = TestbedHarnessEnvironment.loader(f);
    const nav = await loader.getHarness(AuiSidebarHarness.with({ label: 'Main' }));
    expect(await nav.getItemLabels()).toEqual(['Home', 'Reports']);
    await nav.click('Reports');
    expect(await nav.isGroupExpanded('Reports')).toBe(true);
    expect(await nav.getItemLabels()).toEqual(['Home', 'Reports', 'Annual']);
    await nav.click('Annual');
    expect(await nav.getCurrentLabel()).toBe('Annual');

    const pager = await loader.getHarness(AuiPaginationHarness);
    expect(await pager.getCurrentPage()).toBe(1);
    expect(await pager.isDisabled('previous')).toBe(true);
    await pager.goTo('next');
    expect(f.componentInstance.page()).toBe(2);
    await pager.goTo(5);
    expect(await pager.getCurrentPage()).toBe(5);

    const menu = await loader.getHarness(AuiMenuHarness.with({ triggerText: 'Actions' }));
    expect(await menu.getItems()).toEqual([
      { label: 'Copy', disabled: false, checked: null, hasSubmenu: false },
      { label: 'More', disabled: false, checked: null, hasSubmenu: true },
      { label: 'Pinned', disabled: false, checked: false, hasSubmenu: false },
    ]);
    await menu.select('More', 'Archive');
    expect(f.componentInstance.chosen()?.id).toBe('archive');
    expect(await menu.isOpen()).toBe(false);
  });
});
