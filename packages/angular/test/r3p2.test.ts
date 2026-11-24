import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { OrgChartNode, OrgChartNodeSelectDetail } from '@absoluteui/components/org-chart';
import type { PivotField, PivotGridLayoutChangeDetail, PivotLayoutInput } from '@absoluteui/components/pivot-grid';
import { AuiOrgChart } from '../src/org-chart/index.js';
import { AuiPivotFieldList } from '../src/pivot-field-list/index.js';
import { AuiPivotGrid } from '../src/pivot-grid/index.js';

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

interface Sale {
  region: string;
  year: string;
  amount: number;
}

const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
  }
};

@Component({
  imports: [AuiPivotGrid, AuiPivotFieldList],
  template: `
    <aui-pivot-field-list label="Fields" [grid]="pivot"></aui-pivot-field-list>
    <aui-pivot-grid #pivot="auiPivotGrid" caption="Sales" [fields]="fields" [data]="data()" [layout]="layout" (layoutChanged)="last.set($event)"></aui-pivot-grid>
  `,
})
class PivotHost {
  readonly fields: PivotField<Sale>[] = [{ id: 'region', label: 'Region' }, { id: 'year', label: 'Year' }, { id: 'amount', label: 'Amount' }];
  readonly data = signal<Sale[]>([{ region: 'North', year: '2025', amount: 5 }, { region: 'South', year: '2026', amount: 7 }]);
  readonly layout: PivotLayoutInput = { rows: ['region'], columns: [], values: [{ field: 'amount', aggregate: 'sum' }] };
  readonly last = signal<PivotGridLayoutChangeDetail | null>(null);
}

@Component({
  imports: [AuiOrgChart],
  template: `<aui-org-chart label="Company" [nodes]="nodes" [expandDepth]="1" (nodeSelected)="selected.set($event.id)"></aui-org-chart>`,
})
class OrgHost {
  readonly nodes: OrgChartNode[] = [{ id: 'a', parentId: null, label: 'Ada' }, { id: 'b', parentId: 'a', label: 'Bob' }];
  readonly selected = signal<OrgChartNodeSelectDetail['id'] | null>(null);
}

describe('Angular adapter: R3 phase 2', () => {
  it('pivot grid renders from inputs, reloads on data changes, and the field list edits it', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PivotHost);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.aui-pivot caption')?.textContent).toBe('Sales');
    expect([...el.querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual(['North', 'South', 'Grand total']);
    fixture.componentInstance.data.set([{ region: 'East', year: '2026', amount: 1 }]);
    await settle(fixture);
    expect([...el.querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual(['East', 'Grand total']);
    // The field list found the grid through its controller signal.
    const remove = el.querySelector<HTMLButtonElement>('.aui-pivot-fields__remove');
    expect(remove).not.toBeNull();
    remove?.click();
    await settle(fixture);
    expect(fixture.componentInstance.last()?.layout.rows).toEqual([]);
  });

  it('org chart renders a tree and forwards aui-node-select', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(OrgHost);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('[role="treeitem"]')].map((n) => n.getAttribute('aria-level'))).toEqual(['1', '2']);
    el.querySelector<HTMLElement>('[data-aui-node="b"]')?.click();
    await settle(fixture);
    expect(fixture.componentInstance.selected()).toBe('b');
  });
});
