import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, inject, input, provideZonelessChangeDetection, signal, viewChild, type OnDestroy, type TemplateRef } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { DataTableColumn } from '@absoluteui/components/data-table';
import type { KanbanCard } from '@absoluteui/components/kanban';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiAlert } from '../src/alert/index.js';
import { AUI_CARD } from '../src/card/index.js';
import { AuiDataTable } from '../src/data-table/index.js';
import { AuiKanban } from '../src/kanban/index.js';
import { AUI_DIALOG_DATA, AuiDialogRef, AuiDialogService, AuiDrawerService, type AuiOverlayTemplateContext } from '../src/overlay/index.js';
import { AuiCell, AuiItem, AuiRowDetail } from '../src/templates/index.js';

// docs/PLAN-R9-ANGULAR.md M3: templates in render slots, projection, overlay services.
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
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

let live = 0;

/** Counts live instances: proves embedded views are destroyed when the component drops their nodes. */
@Component({ selector: 'test-badge', template: '<b class="badge">{{ text() }}</b>' })
class Badge implements OnDestroy {
  readonly text = input.required<string>();
  constructor() {
    live++;
  }
  ngOnDestroy(): void {
    live--;
  }
}

interface Person {
  id: string;
  name: string;
}

const people = (n: number, suffix = ''): Person[] => Array.from({ length: n }, (_, i) => ({ id: `p${String(i)}`, name: `Person ${String(i)}${suffix}` }));

@Component({
  imports: [AuiDataTable, AuiCell, AuiRowDetail, Badge],
  template: `
    <aui-data-table caption="People" [columns]="columns" [rows]="rows()" [rowId]="byId" [(expanded)]="expanded">
      <ng-template auiCell="name" [auiCellOf]="rows()" let-person>
        <test-badge [text]="prefix() + person.name" />
      </ng-template>
      <ng-template auiRowDetail [auiRowDetailOf]="rows()" let-person>
        <p class="detail">Details of {{ person.name }}</p>
      </ng-template>
    </aui-data-table>
  `,
})
class TableHost {
  readonly rows = signal(people(3));
  readonly prefix = signal('');
  readonly expanded = signal<readonly string[]>([]);
  readonly columns: DataTableColumn<Person>[] = [
    { id: 'name', header: 'Name', accessor: (p) => p.name },
    { id: 'id', header: 'Id', accessor: (p) => p.id },
  ];
  readonly byId = (p: Person): string => p.id;
}

describe('templates in render slots (D8)', () => {
  it('renders cell and row detail templates as live views', async () => {
    live = 0;
    const f = await render(TableHost);
    const el = f.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('.badge')].map((b) => b.textContent)).toEqual(['Person 0', 'Person 1', 'Person 2']);
    expect(live).toBe(3);
    // Bindings in the template stay live.
    f.componentInstance.prefix.set('> ');
    await f.whenStable();
    expect(el.querySelector('.badge')!.textContent).toBe('> Person 0');
    f.componentInstance.expanded.set(['p1']);
    await f.whenStable();
    expect(el.querySelector('.detail')!.textContent).toBe('Details of Person 1');
    f.componentInstance.expanded.set([]);
    await f.whenStable();
    expect(el.querySelector('.detail')).toBeNull();
  });

  it('creating and destroying 10,000 template views leaves no live views', async () => {
    live = 0;
    const f = await render(TableHost);
    for (let i = 0; i < 200; i++) {
      // New row objects: every rendered row is re-rendered and the previous views are released.
      f.componentInstance.rows.set(people(50, `#${String(i)}`));
      await f.whenStable();
    }
    // One live view per rendered cell (the table shows one page of 25 rows).
    const rendered = (f.nativeElement as HTMLElement).querySelectorAll('.badge').length;
    expect(rendered).toBe(25);
    expect(live).toBe(rendered);
    f.destroy();
    expect(live).toBe(0);
  });
});

@Component({
  imports: [AuiKanban, AuiItem],
  template: `
    <aui-kanban label="Board" [columns]="columns" [cards]="cards()">
      <ng-template auiItem [auiItemOf]="cards()" let-card>
        <span class="card-title">{{ card.title }}</span>
      </ng-template>
    </aui-kanban>
  `,
})
class KanbanHost {
  readonly columns = [{ id: 'todo', label: 'To do' }];
  readonly cards = signal<readonly KanbanCard[]>([{ id: 'a', columnId: 'todo', title: 'Write docs' }]);
}

describe('item templates', () => {
  it('Kanban renders cards from the template', async () => {
    const f = await render(KanbanHost);
    expect((f.nativeElement as HTMLElement).querySelector('.card-title')!.textContent).toBe('Write docs');
  });
});

@Component({
  imports: [...AUI_CARD, AuiAlert],
  template: `
    <aui-card class="c" title="Customer" subtitle="Since 2019">
      <aui-card-content><p class="body">Ada {{ suffix() }}</p></aui-card-content>
      <aui-card-footer><button class="act" type="button">Open</button></aui-card-footer>
    </aui-card>
    <aui-alert class="a" tone="success">Saved <a href="#x">view</a></aui-alert>
  `,
})
class ProjectionHost {
  readonly suffix = signal('Lovelace');
}

describe('content projection', () => {
  it('Card parts and Alert default content are placed by the component and stay live', async () => {
    const f = await render(ProjectionHost);
    const el = f.nativeElement as HTMLElement;
    const card = el.querySelector('aui-card.c')!;
    expect(card.querySelector('.body')!.textContent).toBe('Ada Lovelace');
    expect(card.querySelector('.act')).not.toBeNull();
    f.componentInstance.suffix.set('King');
    await f.whenStable();
    expect(card.querySelector('.body')!.textContent).toBe('Ada King');
    const alert = el.querySelector('aui-alert.a')!;
    expect(alert.textContent).toContain('Saved');
    expect(alert.querySelector('a[href="#x"]')).not.toBeNull();
  });
});

@Component({ selector: 'test-edit', template: '<p class="edit">Editing {{ data.name }}</p><button class="save" type="button" (click)="save()">Save</button>' })
class EditPerson {
  readonly data = inject<Person>(AUI_DIALOG_DATA);
  readonly ref = inject<AuiDialogRef<string>>(AuiDialogRef);
  save(): void {
    this.ref.close(`saved ${this.data.name}`);
  }
}

@Component({
  template: `<ng-template #confirm let-who let-ref="ref"><p class="tpl">Delete {{ who }}?</p><button class="yes" type="button" (click)="ref.close(true)">Yes</button></ng-template>`,
})
class OverlayHost {
  readonly confirm = viewChild.required<TemplateRef<AuiOverlayTemplateContext<string, boolean>>>('confirm');
}

describe('overlay services', () => {
  it('opens a component with data and resolves with its result', async () => {
    await render(OverlayHost);
    const ref = TestBed.inject(AuiDialogService).open<string, Person>(EditPerson, { title: 'Edit person', data: { id: 'p1', name: 'Ada' } });
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.edit')!.textContent).toBe('Editing Ada');
    await userEvent.click(dialog.querySelector('.save')!);
    const closed = await ref.closed;
    expect(closed.result).toBe('saved Ada');
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('opens a template in a drawer; Escape dismisses with no result', async () => {
    const f = await render(OverlayHost);
    const ref = TestBed.inject(AuiDrawerService).open<boolean, string>(f.componentInstance.confirm(), { title: 'Confirm', data: 'report.pdf' });
    expect(document.querySelector('.tpl')!.textContent).toBe('Delete report.pdf?');
    await userEvent.keyboard('{Escape}');
    const closed = await ref.closed;
    expect(closed.result).toBeUndefined();
    expect(document.querySelector('.tpl')).toBeNull();
  });
});
