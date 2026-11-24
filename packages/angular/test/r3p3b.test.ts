import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import type { GanttTask } from '@absoluteui/components/gantt';
import type { KanbanCard, KanbanColumn } from '@absoluteui/components/kanban';
import { AuiGantt } from '../src/gantt/index.js';
import { AuiKanban } from '../src/kanban/index.js';

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

const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
  }
};

@Component({
  imports: [AuiKanban, AuiGantt],
  template: `
    <aui-kanban label="Board" [columns]="columns" [cards]="cards" (cardActivated)="opened.set($event.id)"></aui-kanban>
    <aui-gantt label="Plan" [tasks]="tasks" [today]="today" [scale]="scale()"></aui-gantt>
  `,
})
class BoardHost {
  readonly columns: KanbanColumn[] = [{ id: 'todo', label: 'To do' }];
  readonly cards: KanbanCard[] = [{ id: 'a', columnId: 'todo', title: 'Write spec' }];
  readonly tasks: GanttTask[] = [{ id: 't1', parentId: null, label: 'Design', start: plainDate(2026, 9, 28), duration: 3 }];
  readonly today = plainDate(2026, 9, 28);
  readonly scale = signal<'day' | 'week' | 'month'>('week');
  readonly opened = signal<string | null>(null);
}

describe('Angular adapter: R3 phase 3b', () => {
  it('kanban forwards aui-card-activate; gantt renders and follows inputs', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(BoardHost);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('[data-aui-card="a"]')?.click();
    await settle(fixture);
    expect(fixture.componentInstance.opened()).toBe('a');
    expect(el.querySelector('[role="treegrid"]')?.getAttribute('aria-label')).toBe('Plan');
    fixture.componentInstance.scale.set('month');
    await settle(fixture);
    expect(el.querySelector('.aui-gantt')?.classList.contains('aui-gantt--month')).toBe(true);
  });
});
