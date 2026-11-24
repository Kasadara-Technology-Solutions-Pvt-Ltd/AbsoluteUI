import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { DashboardCatalogAddDetail, DashboardGridLayoutChangeDetail, DashboardItem } from '@absoluteui/components/dashboard-grid';
import { AuiBoxPlot } from '../src/box-plot/index.js';
import { AuiBulletChart } from '../src/bullet-chart/index.js';
import { AuiComboChart } from '../src/combo-chart/index.js';
import { AuiDashboardCatalog, AuiDashboardGrid } from '../src/dashboard-grid/index.js';
import { AuiDashboardWidget } from '../src/dashboard-widget/index.js';
import { AuiFunnelChart } from '../src/funnel-chart/index.js';
import { AuiGauge } from '../src/gauge/index.js';
import { AuiHeatmap } from '../src/heatmap/index.js';
import { AuiHistogram } from '../src/histogram/index.js';
import { AuiRadarChart } from '../src/radar-chart/index.js';
import { AuiRichTextEditor } from '../src/rich-text-editor/index.js';
import { AuiScatterChart } from '../src/scatter-chart/index.js';
import { AuiStatCard } from '../src/stat-card/index.js';
import { AuiTreemap } from '../src/treemap/index.js';
import { AuiWaterfallChart } from '../src/waterfall-chart/index.js';

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

@Component({
  imports: [
    ReactiveFormsModule, AuiScatterChart, AuiComboChart, AuiWaterfallChart, AuiHistogram, AuiHeatmap, AuiGauge, AuiRadarChart, AuiTreemap,
    AuiFunnelChart, AuiBoxPlot, AuiBulletChart, AuiStatCard, AuiRichTextEditor,
  ],
  template: `
    <aui-scatter-chart label="S" [series]="scatter" zoom="xy"></aui-scatter-chart>
    <aui-combo-chart label="C" [categories]="cats" [series]="combo"></aui-combo-chart>
    <aui-waterfall-chart label="W" [steps]="steps"></aui-waterfall-chart>
    <aui-histogram label="H" [values]="values"></aui-histogram>
    <aui-heatmap label="M" [columns]="cats" [rows]="cats" [values]="matrix"></aui-heatmap>
    <aui-gauge label="G" [value]="40"></aui-gauge>
    <aui-radar-chart label="R" [axes]="axes" [series]="radar"></aui-radar-chart>
    <aui-treemap label="T" [data]="tree"></aui-treemap>
    <aui-funnel-chart label="F" [stages]="steps"></aui-funnel-chart>
    <aui-box-plot label="B" [categories]="cats" [series]="boxes"></aui-box-plot>
    <aui-bullet-chart label="U" [measures]="measures"></aui-bullet-chart>
    <aui-stat-card label="Revenue" [value]="10" [previous]="8"></aui-stat-card>
    <aui-rich-text-editor label="Notes" [formControl]="notes"></aui-rich-text-editor>
  `,
})
class R3Host {
  readonly cats = ['a'];
  readonly scatter = [{ id: 'a', label: 'A', points: [{ x: 1, y: 2 }] }];
  readonly combo = [{ id: 'a', label: 'A', type: 'bar' as const, values: [1] }];
  readonly steps = [{ id: 'a', label: 'A', value: 1 }];
  readonly values = [1, 2, 3];
  readonly matrix = [[1]];
  readonly axes = ['a', 'b', 'c'];
  readonly radar = [{ id: 's', label: 'S', values: [1, 2, 3] }];
  readonly tree = [{ id: 'a', label: 'A', value: 1 }];
  readonly boxes = [{ id: 's', label: 'S', data: [[1, 2, 3]] }];
  readonly measures = [{ id: 'm', label: 'M', value: 1 }];
  readonly notes = new FormControl('<p>Hi</p>', { nonNullable: true });
}

@Component({
  imports: [AuiDashboardGrid, AuiDashboardCatalog, AuiDashboardWidget],
  template: `
    <aui-dashboard-catalog label="Add" [templates]="templates" [grid]="board" (catalogAdded)="add($event)"></aui-dashboard-catalog>
    <aui-dashboard-grid #board="auiDashboardGrid" label="Board" [items]="items" [breakpoints]="breakpoints" [editable]="true" (layoutChanged)="last.set($event)">
      @for (id of ids(); track id) {
        <aui-dashboard-widget [attr.data-aui-item]="id" [title]="'Widget ' + id"><p>Body {{ id }}</p></aui-dashboard-widget>
      }
    </aui-dashboard-grid>
  `,
})
class DashboardHost {
  readonly items: DashboardItem[] = [{ id: 'a', x: 0, y: 0, w: 6, h: 2 }, { id: 'b', x: 6, y: 0, w: 6, h: 2 }];
  readonly templates = [{ id: 'kpi', label: 'KPI', w: 3, h: 1 }];
  // One breakpoint: the test viewport is narrow.
  readonly breakpoints = [{ name: 'lg', minWidth: 0, columns: 12 }];
  readonly ids = signal(['a', 'b']);
  readonly last = signal<DashboardGridLayoutChangeDetail | null>(null);
  add(event: CustomEvent<DashboardCatalogAddDetail>): void {
    this.ids.update((list) => [...list, event.detail.item.id]);
  }
}

describe('Angular adapter: R3 directives', () => {
  it('every generated R3 directive renders; the rich text editor binds a FormControl', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(R3Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const expected = ['aui-scatter-chart', 'aui-combo-chart', 'aui-waterfall-chart', 'aui-histogram', 'aui-heatmap', 'aui-gauge', 'aui-radar-chart', 'aui-treemap', 'aui-funnel-chart', 'aui-box-plot', 'aui-bullet-chart', 'aui-stat-card', 'aui-rte'];
    expect(expected.filter((c) => !el.querySelector(`.${c}`))).toEqual([]);
    expect(el.querySelector('.aui-rte__content')?.textContent).toBe('Hi');
    fixture.componentInstance.notes.setValue('<p>Changed</p>');
    await fixture.whenStable();
    expect(el.querySelector('.aui-rte__content')?.textContent).toBe('Changed');
  });

  it('dashboard grid, catalog, and widgets work with Angular-rendered children', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(DashboardHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const a = el.querySelector<HTMLElement>('[data-aui-item="a"]')!;
    expect(a.style.getPropertyValue('grid-column')).toBe('1 / span 6');
    expect(a.querySelector('.aui-widget__heading')?.textContent).toBe('Widget a');
    expect(a.hasAttribute('title')).toBe(false);
    fixture.detectChanges();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.aui-dashboard-catalog__template')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[data-aui-item="kpi-1"] .aui-widget__heading')?.textContent).toBe('Widget kpi-1');
    expect(fixture.componentInstance.last()?.reason).toBe('add');
  });
});
