import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { provideAbsoluteUI } from '../src/index.js';
import { AUI_DATA_TABLE, AuiDataTable } from '../src/data-table/index.js';
import { AuiLineChart } from '../src/line-chart/index.js';
import { AuiSelect } from '../src/select/index.js';
import { AuiSidebar } from '../src/sidebar/index.js';
import { AuiTabs } from '../src/tabs/index.js';
import { AuiDataTableHarness, AuiSelectHarness } from '../src/testing/index.js';

// docs/PLAN-R9-ANGULAR.md M8b items 5-6 (D25, D26): read-only state signals; typed methods keep models in line.
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

interface Row {
  id: string;
  name: string;
}

@Component({
  imports: [AuiTabs, AuiSidebar, AuiSelect, AuiLineChart, ...AUI_DATA_TABLE],
  template: `
    <aui-tabs #tabs="auiTabs" label="Views" [tabs]="views" [(value)]="view" />
    <aui-sidebar #nav="auiSidebar" label="Main" [items]="items" [breakpoint]="0" />
    <aui-select #team="auiSelect" label="Team" [options]="teams" />
    <aui-line-chart #chart="auiLineChart" label="Hours" [x]="months" [series]="series" [(hiddenSeries)]="hidden" />
    <aui-data-table caption="People" [rows]="rows" [rowId]="byId" selection="multiple" searchable [(selected)]="selected">
      <aui-column field="name" header="Name" rowHeader />
    </aui-data-table>
  `,
})
class Host {
  readonly table = viewChild.required(AuiDataTable<Row>);
  readonly tabsRef = viewChild.required<AuiTabs>('tabs');
  readonly navRef = viewChild.required<AuiSidebar>('nav');
  readonly teamRef = viewChild.required<AuiSelect>('team');
  readonly chartRef = viewChild.required<AuiLineChart>('chart');
  readonly views = [
    { id: 'a', label: 'A', content: 'A' },
    { id: 'b', label: 'B', content: 'B' },
  ];
  readonly view = signal<string | undefined>('a');
  readonly items = [{ id: 'home', label: 'Home' }];
  readonly teams = [{ value: 'core', label: 'Core' }];
  readonly months = ['Jan', 'Feb'];
  readonly series = [
    { id: 'plan', label: 'Plan', values: [1, 2] },
    { id: 'actual', label: 'Actual', values: [2, 3] },
  ];
  readonly hidden = signal<readonly string[] | undefined>(undefined);
  readonly rows: readonly Row[] = [
    { id: 'r1', name: 'Ada' },
    { id: 'r2', name: 'Lin' },
    { id: 'r3', name: 'Grace' },
  ];
  readonly selected = signal<readonly string[] | undefined>(undefined);
  readonly byId = (r: Row): string => r.id;
}

describe('state signals and model sync (M8b)', () => {
  it('typed methods update models (Tabs select, Data Table setSelected, chart setSeriesVisible)', async () => {
    const f = await render(Host);
    const host = f.componentInstance;
    host.tabsRef().select('b');
    expect(host.view()).toBe('b');
    host.table().setSelected(['r2']);
    expect(host.selected()).toEqual(['r2']);
    host.chartRef().setSeriesVisible('plan', false);
    expect(host.hidden()).toEqual(['plan']);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('B');
  });

  it('a legend toggle updates [(hiddenSeries)] (chart models, D5)', async () => {
    const f = await render(Host);
    const legend = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('aui-line-chart button.aui-chart__legend-item[data-series="actual"]');
    if (!legend) throw new Error('no legend toggle');
    legend.click();
    await f.whenStable();
    expect(f.componentInstance.hidden()).toEqual(['actual']);
  });

  it('read-only state signals follow the component', async () => {
    const f = await render(Host);
    const host = f.componentInstance;
    const loader = TestbedHarnessEnvironment.loader(f);
    expect(host.navRef().mode()).toBe('inline');
    expect(host.navRef().isOpen()).toBe(false);
    expect(host.teamRef().isOpen()).toBe(false);
    await (await loader.getHarness(AuiSelectHarness)).open();
    expect(host.teamRef().isOpen()).toBe(true);
    expect(host.table().rowCount()).toBe(3);
    await (await loader.getHarness(AuiDataTableHarness)).search('gr');
    expect(host.table().rowCount()).toBe(1);
  });
});
