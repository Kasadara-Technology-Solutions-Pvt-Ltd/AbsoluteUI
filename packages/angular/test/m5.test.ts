import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { DataTableSort } from '@absoluteui/components/data-table';
import { provideAbsoluteUI } from '../src/index.js';
import { AUI_DATA_TABLE } from '../src/data-table/index.js';

// docs/PLAN-R9-ANGULAR.md M5: Data Table through Angular only (hard gate: no controller access).
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

interface Employee {
  id: string;
  name: string;
  dept: string;
  salary: number;
}

const STAFF: Employee[] = [
  { id: 'e1', name: 'Ada', dept: 'Engineering', salary: 100 },
  { id: 'e2', name: 'Bob', dept: 'Sales', salary: 60 },
  { id: 'e3', name: 'Cy', dept: 'Engineering', salary: 80 },
];

@Component({
  imports: [...AUI_DATA_TABLE],
  template: `
    <aui-data-table caption="Employees" [rows]="rows()" [rowId]="byId" selection="multiple"
      [(selected)]="picked" [(sort)]="sort" [groupBy]="groupBy()" [(collapsedGroups)]="collapsed">
      <aui-column field="name" header="Employee" rowHeader>
        <ng-template auiCell [auiCellOf]="rows()" let-e><b class="who">{{ e.name }}</b></ng-template>
        <ng-template auiHeader let-header="header"><i class="head">{{ header }}!</i></ng-template>
      </aui-column>
      <aui-column field="dept" header="Department" />
      <aui-column header="Salary" id="salary" [accessor]="salaryOf" type="number" aggregate="sum" />
      <ng-template auiGroupHeader [auiGroupHeaderOf]="rows()" let-group><span class="grp">{{ group.label }} / {{ group.count }}</span></ng-template>
      <ng-template auiEmpty><p class="none">No staff yet.</p></ng-template>
    </aui-data-table>
  `,
})
class TableHost {
  readonly rows = signal<readonly Employee[]>(STAFF);
  readonly picked = signal<readonly string[]>([]);
  readonly sort = signal<DataTableSort | readonly DataTableSort[] | null | undefined>(null);
  readonly groupBy = signal<readonly string[]>([]);
  readonly collapsed = signal<readonly string[]>([]);
  readonly byId = (e: Employee): string => e.id;
  readonly salaryOf = (e: Employee): number => e.salary;
}

const rowsText = (el: HTMLElement): string[] => Array.from(el.querySelectorAll('tbody .who')).map((b) => b.textContent);

describe('Data Table through Angular (M5)', () => {
  it('declared columns with cell and header templates, totals, and the empty template', async () => {
    const f = await render(TableHost);
    const el = f.nativeElement as HTMLElement;
    expect(rowsText(el)).toEqual(['Ada', 'Bob', 'Cy']);
    const head = el.querySelector('thead .head')!;
    expect(head.textContent).toBe('Employee!');
    // The header text stays the accessible name of the sort button.
    expect(head.closest('button')!.textContent).toContain('Employee');
    expect(Array.from(el.querySelectorAll('tfoot tr > *')).map((c) => c.textContent.trim())).toContain('240');
    f.componentInstance.rows.set([]);
    await f.whenStable();
    expect(el.querySelector('.none')!.textContent).toBe('No staff yet.');
  });

  it('two-way selection and sort follow the user', async () => {
    const f = await render(TableHost);
    const el = f.nativeElement as HTMLElement;
    // The native checkbox is visually hidden behind the styled box; activate it like Space would.
    el.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')!.click();
    await f.whenStable();
    expect(f.componentInstance.picked()).toEqual(['e1']);
    const sortButton = Array.from(el.querySelectorAll<HTMLButtonElement>('thead button.aui-data-table__sort')).find((b) => b.textContent.includes('Salary'))!;
    await userEvent.click(sortButton);
    expect(f.componentInstance.sort()).toEqual([{ column: 'salary', direction: 'ascending' }]);
    expect(rowsText(el)).toEqual(['Bob', 'Cy', 'Ada']);
  });

  it('grouping with a group header template and two-way collapsed groups', async () => {
    const f = await render(TableHost);
    const el = f.nativeElement as HTMLElement;
    f.componentInstance.groupBy.set(['dept']);
    await f.whenStable();
    expect(Array.from(el.querySelectorAll('.grp')).map((g) => g.textContent)).toEqual(['Engineering / 2', 'Sales / 1']);
    await userEvent.click(el.querySelector('.aui-data-table__group-toggle')!);
    expect(f.componentInstance.collapsed()).toEqual(['dept=Engineering']);
    expect(rowsText(el)).toEqual(['Bob']);
    f.componentInstance.collapsed.set([]);
    await f.whenStable();
    expect(rowsText(el)).toEqual(['Ada', 'Cy', 'Bob']);
  });
});
