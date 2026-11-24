import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { DataTableCellEditDetail } from '@absoluteui/components/data-table';
import { provideAbsoluteUI } from '../src/index.js';
import { AUI_DATA_TABLE } from '../src/data-table/index.js';

// docs/PLAN-R9-ANGULAR.md M5b: inline editing through Angular.
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

interface Task {
  id: string;
  title: string;
  hours: number;
}

@Component({
  imports: [...AUI_DATA_TABLE],
  template: `
    <aui-data-table caption="Tasks" [rows]="tasks()" [rowId]="byId" (cellEdit)="apply($event)">
      <aui-column field="title" header="Title" rowHeader editable [validate]="required" />
      <aui-column field="hours" header="Hours" type="number" editable>
        <ng-template auiEditor let-value let-commit="commit" let-cancel="cancel">
          <span class="stepper">
            <button type="button" class="less" (click)="commit(asNumber(value) - 1)">-1</button>
            <button type="button" class="more" (click)="commit(asNumber(value) + 1)">+1</button>
            <button type="button" class="stop" (click)="cancel()">Cancel</button>
          </span>
        </ng-template>
      </aui-column>
    </aui-data-table>
  `,
})
class EditHost {
  readonly tasks = signal<readonly Task[]>([
    { id: 't1', title: 'Write docs', hours: 3 },
    { id: 't2', title: 'Review', hours: 1 },
  ]);
  readonly byId = (t: Task): string => t.id;
  readonly required = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? null : 'Enter a title.');
  readonly asNumber = (value: unknown): number => (typeof value === 'number' ? value : 0);
  apply(edit: DataTableCellEditDetail<Task>): void {
    this.tasks.update((all) => all.map((t) => (t.id === edit.rowId ? { ...t, [edit.column]: edit.value } : t)));
  }
}

const cellButton = (el: HTMLElement, row: string, column: string): HTMLButtonElement =>
  el.querySelector<HTMLButtonElement>(`button.aui-data-table__edit[data-row-id="${row}"][data-column="${column}"]`)!;

describe('inline editing (M5b)', () => {
  it('built-in editor with validation; (cellEdit) updates the signal and the table follows', async () => {
    const f = await render(EditHost);
    const el = f.nativeElement as HTMLElement;
    await userEvent.click(cellButton(el, 't1', 'title'));
    await userEvent.keyboard('{Control>}a{/Control}{Backspace}{Enter}');
    expect(el.querySelector('.aui-data-table__edit-error')!.textContent).toBe('Enter a title.');
    await userEvent.keyboard('Write the guide{Enter}');
    await f.whenStable();
    expect(f.componentInstance.tasks()[0]!.title).toBe('Write the guide');
    expect(cellButton(el, 't1', 'title').textContent).toContain('Write the guide');
    expect(document.activeElement).toBe(cellButton(el, 't1', 'title'));
  });

  it('auiEditor template commits and cancels through its context', async () => {
    const f = await render(EditHost);
    const el = f.nativeElement as HTMLElement;
    await userEvent.click(cellButton(el, 't2', 'hours'));
    expect(el.querySelector('.stepper')).not.toBeNull();
    await userEvent.click(el.querySelector('.more')!);
    await f.whenStable();
    expect(f.componentInstance.tasks()[1]!.hours).toBe(2);
    expect(el.querySelector('.stepper')).toBeNull();
    await userEvent.click(cellButton(el, 't2', 'hours'));
    await userEvent.click(el.querySelector('.stop')!);
    await f.whenStable();
    expect(f.componentInstance.tasks()[1]!.hours).toBe(2);
    expect(el.querySelector('.stepper')).toBeNull();
  });
});
