import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, plainDate, plainDateToString, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import {
  assertGantt,
  createsCycle,
  Gantt,
  resourceLoad,
  scheduleGantt,
  type GanttDependency,
  type GanttTask,
  type GanttTaskActivateDetail,
  type GanttTaskChangeDetail,
} from '@absoluteui/components/gantt';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

// Fixed dates only (§23.5): Monday 28 September 2026, Monday to Friday working days.
const d = (m: number, day: number): PlainDate => plainDate(2026, m, day);
const iso = (v: PlainDate | undefined): string => (v ? plainDateToString(v) : '');
const cal = createBusinessCalendar();
const task = (id: string, start: PlainDate, duration: number, extra: Partial<GanttTask> = {}): GanttTask => ({ id, parentId: null, label: id.toUpperCase(), start, duration, ...extra });

describe('gantt engine', () => {
  it('schedules finish-to-start with lag and leads over weekends', () => {
    const tasks = [task('a', d(9, 28), 5), task('b', d(9, 28), 3), task('c', d(9, 28), 1), task('e', d(9, 28), 2)];
    const deps: GanttDependency[] = [
      { id: '1', from: 'a', to: 'b' },
      { id: '2', from: 'a', to: 'c', lag: 2 },
      { id: '3', from: 'a', to: 'e', lag: -2 },
    ];
    const s = scheduleGantt(tasks, deps, cal);
    expect(iso(s.tasks.get('a')?.end)).toBe('2026-10-02');
    expect(iso(s.tasks.get('b')?.start)).toBe('2026-10-05');
    expect(iso(s.tasks.get('b')?.end)).toBe('2026-10-07');
    expect(iso(s.tasks.get('c')?.start)).toBe('2026-10-07');
    expect(iso(s.tasks.get('e')?.start)).toBe('2026-10-01');
    expect(s.tasks.get('b')?.driven).toBe(true);
    expect(iso(s.finish ?? undefined)).toBe('2026-10-07');
  });

  it('schedules SS, FF, and SF dependencies', () => {
    const tasks = [task('a', d(9, 28), 5), task('ss', d(9, 21), 2), task('ff', d(9, 21), 3), task('sf', d(9, 21), 2)];
    const deps: GanttDependency[] = [
      { id: '1', from: 'a', to: 'ss', type: 'SS', lag: 1 },
      { id: '2', from: 'a', to: 'ff', type: 'FF' },
      { id: '3', from: 'a', to: 'sf', type: 'SF' },
    ];
    const s = scheduleGantt(tasks, deps, cal);
    expect(iso(s.tasks.get('ss')?.start)).toBe('2026-09-29');
    expect(iso(s.tasks.get('ff')?.start)).toBe('2026-09-30');
    expect(iso(s.tasks.get('ff')?.end)).toBe('2026-10-02');
    expect(iso(s.tasks.get('sf')?.start)).toBe('2026-09-24');
    expect(iso(s.tasks.get('sf')?.end)).toBe('2026-09-25');
  });

  it('keeps a later requested start, skips holidays, and moves non-working starts', () => {
    const holiday = createBusinessCalendar({ holidays: [{ date: d(10, 5), name: 'Founders day' }] });
    const tasks = [task('a', d(9, 28), 5), task('b', d(10, 12), 1), task('c', d(9, 27), 1)];
    const s = scheduleGantt(tasks, [{ id: '1', from: 'a', to: 'b' }, { id: '2', from: 'a', to: 'c' }], holiday);
    expect(iso(s.tasks.get('b')?.start)).toBe('2026-10-12');
    expect(s.tasks.get('b')?.driven).toBe(false);
    expect(iso(s.tasks.get('c')?.start)).toBe('2026-10-06');
    expect(iso(scheduleGantt([task('w', d(10, 3), 1)], [], cal).tasks.get('w')?.start)).toBe('2026-10-05');
  });

  it('computes float and the critical path; manual tasks report violations', () => {
    const tasks = [task('a', d(9, 28), 5), task('b', d(9, 28), 3), task('c', d(9, 28), 2), task('m', d(9, 29), 1, { manual: true })];
    const s = scheduleGantt(tasks, [{ id: '1', from: 'a', to: 'b' }, { id: '2', from: 'a', to: 'm' }], cal);
    expect(s.critical).toEqual(['a', 'c', 'b', 'm'].filter((id) => s.tasks.get(id)?.critical));
    expect(s.tasks.get('a')?.critical).toBe(true);
    expect(s.tasks.get('b')?.critical).toBe(true);
    expect(s.tasks.get('c')?.totalFloat).toBe(6);
    expect(s.tasks.get('c')?.critical).toBe(false);
    expect(s.tasks.get('m')?.violations).toEqual(['2']);
    expect(iso(s.tasks.get('m')?.start)).toBe('2026-09-29');
  });

  it('spans summary tasks, marks milestones, and measures baseline variance', () => {
    const tasks = [
      task('p', d(9, 28), 0),
      task('a', d(9, 28), 2, { parentId: 'p', baseline: { start: d(9, 28), end: d(9, 28) } }),
      task('b', d(10, 1), 3, { parentId: 'p' }),
      task('ms', d(10, 6), 0, { parentId: 'p' }),
    ];
    const s = scheduleGantt(tasks, [], cal);
    const p = s.tasks.get('p');
    expect(p?.summary).toBe(true);
    expect(iso(p?.start)).toBe('2026-09-28');
    expect(iso(p?.end)).toBe('2026-10-06');
    expect(s.tasks.get('ms')?.milestone).toBe(true);
    expect(iso(s.tasks.get('ms')?.end)).toBe('2026-10-06');
    expect(s.tasks.get('a')?.variance).toBe(1);
  });

  it('validates tasks and dependencies (cycles, summaries, duplicates)', () => {
    const code = (fn: () => void): unknown => {
      try {
        fn();
      } catch (e) {
        return e instanceof AbsoluteUIError ? `${e.code} ${e.details.expected ?? ''}` : e;
      }
      return null;
    };
    const tasks = [task('a', d(9, 28), 1), task('b', d(9, 28), 1), task('c', d(9, 28), 1), task('s', d(9, 28), 1), task('k', d(9, 28), 1, { parentId: 's' })];
    expect(code(() => { assertGantt(tasks, [{ id: '1', from: 'a', to: 'b' }, { id: '2', from: 'b', to: 'c' }, { id: '3', from: 'c', to: 'a' }], undefined); })).toMatch(/^GANTT_OPTIONS no cycles \(1 -> 2 -> 3\)/);
    expect(code(() => { assertGantt(tasks, [{ id: '1', from: 's', to: 'a' }], undefined); })).toMatch(/summary/);
    expect(code(() => { assertGantt(tasks, [{ id: '1', from: 'a', to: 'b' }, { id: '2', from: 'a', to: 'b' }], undefined); })).toMatch(/one dependency per pair/);
    expect(code(() => { assertGantt([task('x', d(9, 28), 1.5)], [], undefined); })).toMatch(/^GANTT_OPTIONS/);
    expect(code(() => { assertGantt([task('x', d(9, 28), 1, { assignments: [{ resourceId: 'nobody' }] })], [], []); })).toMatch(/resource/);
    expect(createsCycle([{ id: '1', from: 'a', to: 'b' }], 'b', 'a')).toBe(true);
    expect(createsCycle([{ id: '1', from: 'a', to: 'b' }], 'a', 'c')).toBe(false);
  });

  it('computes resource load and over-allocation', () => {
    const tasks = [task('a', d(9, 28), 5, { assignments: [{ resourceId: 'r' }] }), task('b', d(9, 30), 2, { assignments: [{ resourceId: 'r', units: 50 }] })];
    const s = scheduleGantt(tasks, [], cal);
    const [load] = resourceLoad(tasks, s, [{ id: 'r', label: 'Robin' }], cal, { start: d(9, 28), end: d(10, 4) });
    expect(load?.days.map((x) => x.load)).toEqual([100, 100, 150, 150, 100]);
    expect(load?.overDays).toBe(2);
    expect(load?.peak).toBe(150);
  });
});

const project: GanttTask[] = [
  { id: 'plan', parentId: null, label: 'Planning', start: d(9, 28), duration: 0 },
  { id: 'req', parentId: 'plan', label: 'Requirements', start: d(9, 28), duration: 3, progress: 50, assignments: [{ resourceId: 'ana' }], baseline: { start: d(9, 28), end: d(9, 29) } },
  { id: 'design', parentId: 'plan', label: 'Design', start: d(9, 28), duration: 2, assignments: [{ resourceId: 'ana' }] },
  { id: 'build', parentId: null, label: 'Build', start: d(9, 28), duration: 5 },
  { id: 'docs', parentId: null, label: 'Docs', start: d(9, 28), duration: 2, readOnly: true },
  { id: 'go', parentId: null, label: 'Launch', start: d(9, 28), duration: 0 },
];
const deps: GanttDependency[] = [
  { id: 'd1', from: 'req', to: 'design' },
  { id: 'd2', from: 'design', to: 'build' },
  { id: 'd3', from: 'build', to: 'go' },
];

const LAYOUT_CSS = `
.aui-gantt__body { display: grid; grid-template-columns: 400px max-content; overflow: auto; max-block-size: 400px; position: relative; }
.aui-gantt__table { inline-size: 400px; }
.aui-gantt__head { block-size: 48px; }
.aui-gantt__rows, .aui-gantt__canvas { position: relative; }
.aui-gantt__row { position: absolute; inset-inline: 0; block-size: var(--aui-gantt-row); display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; }
.aui-gantt__scale { block-size: 48px; }
.aui-gantt__bars { position: absolute; inset: 0; }
.aui-gantt__bar { position: absolute; inline-size: var(--aui-gantt-width); block-size: var(--aui-gantt-row); pointer-events: none; }
.aui-gantt__fill { display: block; block-size: 100%; pointer-events: auto; }
.aui-gantt__resize { position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: 8px; pointer-events: auto; }
.aui-gantt__link-handle { position: absolute; inset-inline-end: -14px; inset-block-start: 8px; inline-size: 10px; block-size: 10px; pointer-events: auto; }
.aui-gantt__bar--milestone .aui-gantt__fill { inline-size: 12px; }
.aui-gantt__hidden, .aui-gantt__instructions { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
`;

function mount(options: Partial<Parameters<typeof Gantt.create>[1]> = {}): { g: Gantt; host: HTMLDivElement } {
  const host = document.createElement('div');
  host.style.setProperty('inline-size', '1000px');
  const style = document.createElement('style');
  style.textContent = LAYOUT_CSS;
  document.body.append(style, host);
  const g = Gantt.create(host, { label: 'Release plan', tasks: project, dependencies: deps, resources: [{ id: 'ana', label: 'Ana' }], today: d(9, 30), locale: 'en-US', scale: 'day', ...options });
  return { g, host };
}
const row = (host: HTMLElement, id: string): HTMLElement => host.querySelector<HTMLElement>(`[role="row"][data-aui-task="${id}"]`)!;
const bar = (host: HTMLElement, id: string): HTMLElement => host.querySelector<HTMLElement>(`.aui-gantt__bar[data-aui-task="${id}"]`)!;
const cell = (host: HTMLElement, id: string, key: string): string => row(host, id).querySelector(`.aui-gantt__cell--${key}`)?.textContent ?? '';
const tool = (host: HTMLElement, action: string): HTMLButtonElement => host.querySelector<HTMLButtonElement>(`[data-aui-action="${action}"]`)!;

describe('gantt rendering', () => {
  it('renders a treegrid with levels, dates, badges, and dependency text', () => {
    const { host } = mount();
    const grid = host.querySelector('[role="treegrid"]')!;
    expect(grid.getAttribute('aria-label')).toBe('Release plan');
    expect(grid.getAttribute('aria-rowcount')).toBe('7');
    expect(Array.from(host.querySelectorAll('[role="columnheader"]'), (h) => h.textContent)).toEqual(['Task', 'Start', 'End', 'Duration']);
    expect(row(host, 'plan').getAttribute('aria-expanded')).toBe('true');
    expect(row(host, 'req').getAttribute('aria-level')).toBe('2');
    expect(row(host, 'req').getAttribute('aria-posinset')).toBe('1');
    expect(cell(host, 'design', 'start')).toBe('10/1/26');
    expect(cell(host, 'design', 'duration')).toBe('2 days');
    expect(cell(host, 'build', 'end')).toBe('10/9/26');
    expect(cell(host, 'plan', 'duration')).toBe('5 days');
    expect(cell(host, 'go', 'name')).toContain('Milestone');
    expect(cell(host, 'build', 'name')).toContain('Critical');
    expect(cell(host, 'build', 'name')).toContain('Depends on Design (finish to start).');
    expect(cell(host, 'req', 'name')).toContain('1 working day behind baseline.');
    expect(host.querySelectorAll('[role="row"][tabindex="0"]')).toHaveLength(1);
    expect(bar(host, 'go').classList.contains('aui-gantt__bar--milestone')).toBe(true);
    expect(bar(host, 'build').classList.contains('aui-gantt__bar--critical')).toBe(true);
    expect(host.querySelectorAll('.aui-gantt__dependency')).toHaveLength(3);
    expect(host.querySelector('.aui-gantt__chart')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the resource histogram with text summaries', () => {
    const { host } = mount({ showHistogram: true });
    const hist = host.querySelector<HTMLElement>('.aui-gantt__histogram')!;
    expect(hist.hidden).toBe(false);
    expect(hist.querySelector('.aui-gantt__load-summary')?.textContent).toBe('Peak 100%, 0 days over capacity');
  });

  it('changes scale and columns', () => {
    const { g, host } = mount();
    const dayWidth = bar(host, 'build').style.getPropertyValue('--aui-gantt-width');
    g.setScale('month');
    expect(host.classList.contains('aui-gantt--month')).toBe(true);
    expect(bar(host, 'build').style.getPropertyValue('--aui-gantt-width')).not.toBe(dayWidth);
    g.update({ columns: ['name', 'resources', 'progress'] });
    expect(cell(host, 'req', 'resources')).toBe('Ana');
    expect(cell(host, 'req', 'progress')).toBe('50%');
    expect(() => { g.update({ columns: ['start'] }); }).toThrow(AbsoluteUIError);
  });
});

describe('gantt keyboard', () => {
  it('moves between rows, expands, collapses, and activates', async () => {
    const activated: string[] = [];
    const { host } = mount();
    host.addEventListener('aui-task-activate', (e) => activated.push((e as CustomEvent<GanttTaskActivateDetail>).detail.id));
    row(host, 'plan').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(row(host, 'req'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(row(host, 'plan'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(row(host, 'plan').getAttribute('aria-expanded')).toBe('false');
    expect(row(host, 'req')).toBeNull();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(row(host, 'req'));
    await userEvent.keyboard('{End}{Enter}');
    expect(activated).toEqual(['go']);
  });

  it('Ctrl+Arrow moves a task and reschedules successors; Shift+Arrow resizes', async () => {
    const changes: GanttTaskChangeDetail[] = [];
    const { g, host } = mount({ editable: true });
    host.addEventListener('aui-task-change', (e) => changes.push((e as CustomEvent<GanttTaskChangeDetail>).detail));
    row(host, 'req').focus();
    await userEvent.keyboard('{Control>}{ArrowRight}{/Control}');
    expect(changes[0]?.reason).toBe('move');
    expect(iso(changes[0]?.changes[0]?.start)).toBe('2026-09-29');
    expect(iso(g.schedule.tasks.get('build')?.start)).toBe('2026-10-06');
    expect(cell(host, 'req', 'start')).toBe('9/29/26');
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(changes[1]?.reason).toBe('resize');
    expect(g.tasks.find((t) => t.id === 'req')?.duration).toBe(4);
    expect(document.activeElement).toBe(row(host, 'req'));
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(g.tasks.find((t) => t.id === 'req')?.duration).toBe(3);
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(g.tasks.find((t) => t.id === 'req')?.duration).toBe(4);
  });

  it('refuses edits of summary and read-only tasks, and honours cancelled events', async () => {
    const { g, host } = mount({ editable: true });
    row(host, 'docs').focus();
    await userEvent.keyboard('{Control>}{ArrowRight}{/Control}');
    expect(iso(g.schedule.tasks.get('docs')?.start)).toBe('2026-09-28');
    expect(tool(host, 'later').getAttribute('aria-disabled')).toBe('true');
    expect(g.moveTask('plan', d(10, 5))).toBe(false);
    host.addEventListener('aui-task-change', (e) => {
      e.preventDefault();
    });
    expect(g.setDuration('build', 9)).toBe(false);
    expect(g.tasks.find((t) => t.id === 'build')?.duration).toBe(5);
  });

  it('a driven task cannot move before its dependency', () => {
    const { g } = mount({ editable: true });
    const before = iso(g.schedule.tasks.get('build')?.start);
    g.moveTask('build', d(9, 28));
    expect(iso(g.schedule.tasks.get('build')?.start)).toBe(before);
  });

  it('links and unlinks with the toolbar and Enter', async () => {
    const changes: GanttTaskChangeDetail[] = [];
    const { g, host } = mount({ editable: true });
    host.addEventListener('aui-task-change', (e) => changes.push((e as CustomEvent<GanttTaskChangeDetail>).detail));
    row(host, 'req').focus();
    tool(host, 'link').click();
    expect(tool(host, 'link').getAttribute('aria-pressed')).toBe('true');
    row(host, 'docs').focus();
    await userEvent.keyboard('{Enter}');
    expect(changes).toHaveLength(0);
    row(host, 'go').focus();
    tool(host, 'link').click();
    row(host, 'req').focus();
    await userEvent.keyboard('{Enter}');
    // go -> req would not be a cycle... but go follows build which follows req: refused.
    expect(changes).toHaveLength(0);
    row(host, 'design').focus();
    tool(host, 'link').click();
    row(host, 'go').focus();
    await userEvent.keyboard('{Enter}');
    expect(changes[0]?.reason).toBe('link');
    expect(g.dependencies.some((x) => x.from === 'design' && x.to === 'go')).toBe(true);
    row(host, 'go').focus();
    tool(host, 'link').click();
    row(host, 'design').focus();
    await userEvent.keyboard('{Enter}');
    expect(changes[1]?.reason).toBe('unlink');
    expect(g.dependencies.some((x) => x.from === 'design' && x.to === 'go')).toBe(false);
    tool(host, 'link').click();
    await userEvent.keyboard('{Escape}');
    expect(tool(host, 'link').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('gantt pointer', () => {
  const ev = (type: string, target: EventTarget, x: number, y: number): void => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y }));
  };

  it('drags a bar to move it by whole days', () => {
    const { g, host } = mount({ editable: true });
    const fill = bar(host, 'req').querySelector<HTMLElement>('.aui-gantt__fill')!;
    const r = fill.getBoundingClientRect();
    ev('pointerdown', fill, r.left + 5, r.top + 5);
    ev('pointermove', document, r.left + 40, r.top + 5);
    ev('pointermove', document, r.left + 5 + 64, r.top + 5);
    ev('pointerup', document, r.left + 5 + 64, r.top + 5);
    expect(iso(g.tasks.find((t) => t.id === 'req')?.start)).toBe('2026-09-30');
  });

  it('drags the end to resize and the link handle onto another bar', () => {
    const { g, host } = mount({ editable: true });
    const resize = bar(host, 'build').querySelector<HTMLElement>('.aui-gantt__resize')!;
    const r = resize.getBoundingClientRect();
    ev('pointerdown', resize, r.left + 2, r.top + 5);
    ev('pointermove', document, r.left + 40, r.top + 5);
    ev('pointermove', document, r.left + 2 + 96, r.top + 5);
    ev('pointerup', document, r.left + 2 + 96, r.top + 5);
    // Three calendar days later, over a weekend: Oct 9 (Fri) + 3 = Oct 12 (Mon).
    expect(g.tasks.find((t) => t.id === 'build')?.duration).toBe(6);
    // Hit testing needs the target inside the test viewport (narrower than the host).
    bar(host, 'build').querySelector<HTMLElement>('.aui-gantt__fill')!.scrollIntoView({ block: 'nearest', inline: 'center' });
    const handle = bar(host, 'req').querySelector<HTMLElement>('.aui-gantt__link-handle')!;
    const h = handle.getBoundingClientRect();
    const target = bar(host, 'build').querySelector<HTMLElement>('.aui-gantt__fill')!.getBoundingClientRect();
    ev('pointerdown', handle, h.left + 3, h.top + 3);
    ev('pointermove', document, h.left + 20, h.top + 20);
    ev('pointermove', document, target.left + 20, target.top + target.height / 2);
    expect(bar(host, 'build').classList.contains('aui-gantt__bar--drop')).toBe(true);
    ev('pointerup', document, target.left + 20, target.top + target.height / 2);
    expect(g.dependencies.some((x) => x.from === 'req' && x.to === 'build')).toBe(true);
  });
});

describe('gantt virtual rows and lifecycle', () => {
  it('renders only rows in view for large projects', () => {
    const many: GanttTask[] = Array.from({ length: 2000 }, (_, i) => task(`t${String(i)}`, d(9, 28), 1 + (i % 5)));
    const { g, host } = mount({ tasks: many, dependencies: [], resources: [] });
    expect(host.querySelectorAll('[role="row"][data-aui-task]').length).toBeLessThan(60);
    expect(host.querySelector('[role="treegrid"]')?.getAttribute('aria-rowcount')).toBe('2001');
    g.scrollToTask('t1500');
    expect(document.activeElement).toBe(row(host, 't1500'));
    expect(row(host, 't1500').getAttribute('aria-rowindex')).toBe('1502');
  });

  it('update() and destroy()', () => {
    const { g, host } = mount();
    g.update({ tasks: [task('only', d(10, 1), 2)], dependencies: [] });
    expect(host.querySelectorAll('[role="row"][data-aui-task]')).toHaveLength(1);
    expect(g.canUndo).toBe(false);
    g.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-gantt')).toBe(false);
  });
});
