import { afterEach, describe, expect, it } from 'vitest';
import { instant, onNodeRelease, plainDate } from '@absoluteui/core';
import { DataTable } from '@absoluteui/components/data-table';
import { Kanban } from '@absoluteui/components/kanban';
import { OrgChart } from '@absoluteui/components/org-chart';
import { Scheduler } from '@absoluteui/components/scheduler';

// docs/PLAN-R9-ANGULAR.md D8: nodes from render hooks are released when the component drops them.
afterEach(() => {
  document.body.replaceChildren();
});

/** Render hook output that records its release, as a framework integration would. */
function tracker(): { make: (label: string) => HTMLElement; live: Set<string>; released: string[] } {
  const live = new Set<string>();
  const released: string[] = [];
  return {
    live,
    released,
    make: (label) => {
      const el = document.createElement('span');
      el.textContent = label;
      live.add(label);
      return onNodeRelease(el, () => {
        live.delete(label);
        released.push(label);
      });
    },
  };
}

const host = (): HTMLDivElement => {
  const el = document.createElement('div');
  el.style.setProperty('inline-size', '900px');
  document.body.append(el);
  return el;
};

interface Person {
  id: string;
  name: string;
}

describe('render-slot release (D8)', () => {
  it('Data Table: cells and details are released when rows are dropped, re-rendered, or destroyed', () => {
    const t = tracker();
    const rows: Person[] = [
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bob' },
    ];
    const table = DataTable.create<Person>(host(), {
      caption: 'People',
      rows,
      rowId: (p) => p.id,
      columns: [{ id: 'name', header: 'Name', accessor: (p) => p.name, render: (p) => t.make(`cell:${p.id}`) }],
      renderDetail: (p) => t.make(`detail:${p.id}`),
      expanded: ['a'],
    });
    expect([...t.live].sort()).toEqual(['cell:a', 'cell:b', 'detail:a']);
    table.update({ rows: [rows[0]!] });
    expect(t.released).toContain('cell:b');
    expect(t.live.has('cell:a')).toBe(true);
    table.update({ expanded: [] });
    expect(t.released).toContain('detail:a');
    table.update({ rows: [{ id: 'a', name: 'Ada L.' }] });
    expect(t.released).toContain('cell:a');
    table.destroy();
    expect(t.live.size).toBe(0);
  });

  it('Kanban: replaced and removed cards are released', () => {
    const t = tracker();
    const columns = [{ id: 'todo', label: 'To do' }];
    const k = Kanban.create(host(), {
      label: 'Board',
      columns,
      cards: [
        { id: 'x', columnId: 'todo', title: 'X' },
        { id: 'y', columnId: 'todo', title: 'Y' },
      ],
      renderCard: (card) => t.make(`${card.id}:${card.title}`),
    });
    expect(t.live).toEqual(new Set(['x:X', 'y:Y']));
    k.update({ cards: [{ id: 'x', columnId: 'todo', title: 'X2' }] });
    expect(t.live).toEqual(new Set(['x:X2']));
    k.destroy();
    expect(t.live.size).toBe(0);
  });

  it('Org Chart: removed nodes and destroy release rendered cards', () => {
    const t = tracker();
    const chart = OrgChart.create(host(), {
      label: 'Company',
      nodes: [
        { id: 'ceo', parentId: null, label: 'CEO' },
        { id: 'cto', parentId: 'ceo', label: 'CTO' },
      ],
      renderNode: (node) => t.make(node.id),
    });
    expect(t.live).toEqual(new Set(['ceo', 'cto']));
    chart.update({ nodes: [{ id: 'ceo', parentId: null, label: 'CEO' }] });
    expect(t.live.has('cto')).toBe(false);
    chart.destroy();
    expect(t.live.size).toBe(0);
  });

  it('Scheduler: event content is released on re-render and destroy', () => {
    const t = tracker();
    let n = 0;
    const s = Scheduler.create(host(), {
      label: 'Calendar',
      date: plainDate(2026, 9, 29),
      timezone: 'UTC',
      events: [{ id: 'e1', title: 'Standup', start: instant(Date.parse('2026-09-29T09:00:00Z')), end: instant(Date.parse('2026-09-29T09:30:00Z')) }],
      renderEvent: (occ) => t.make(`${occ.event.id}#${String(++n)}`),
    });
    const first = [...t.live];
    expect(first.length).toBeGreaterThan(0);
    s.update({ view: 'day' });
    for (const label of first) expect(t.released).toContain(label);
    s.destroy();
    expect(t.live.size).toBe(0);
  });
});
