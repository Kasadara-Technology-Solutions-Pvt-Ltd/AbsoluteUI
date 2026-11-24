import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, instantToString, parseInstant, parseRecurrenceRule, plainDate, resetAbsoluteUIConfig, type Instant, type RecurrenceRule } from '@absoluteui/core';
import {
  applyEdit,
  expandEvents,
  packColumns,
  packLanes,
  Scheduler,
  type SchedulerEvent,
  type SchedulerEventChangeDetail,
  type SchedulerLoadErrorDetail,
  type SchedulerNavigateDetail,
  type SchedulerRange,
  type SchedulerSlotActivateDetail,
} from '@absoluteui/components/scheduler';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

// Fixed instants and zones only (§23.5). The week of Monday 28 September 2026 (London, BST +01:00).
const at = (text: string): Instant => {
  const i = parseInstant(text);
  if (!i) throw new Error(text);
  return i;
};
const rule = (text: string): RecurrenceRule => {
  const r = parseRecurrenceRule(text);
  if (!r) throw new Error(text);
  return r;
};
const ZONE = 'Europe/London';
const NOW = at('2026-09-29T10:20:00Z');
const events: SchedulerEvent[] = [
  { id: 'standup', title: 'Standup', start: at('2026-09-28T08:00:00Z'), end: at('2026-09-28T08:15:00Z'), recurrence: rule('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR'), timeZone: ZONE },
  { id: 'review', title: 'Design review', start: at('2026-09-29T09:00:00Z'), end: at('2026-09-29T10:30:00Z'), location: 'Room 4', color: 3 },
  { id: 'lunch', title: 'Lunch', start: at('2026-09-29T09:30:00Z'), end: at('2026-09-29T10:00:00Z') },
  { id: 'offsite', title: 'Offsite', start: plainDate(2026, 9, 30), end: plainDate(2026, 10, 1) },
  { id: 'deploy', title: 'Deploy', start: at('2026-10-02T12:00:00Z'), end: at('2026-10-02T13:00:00Z'), readOnly: true },
];

// Unit tests load no component CSS: the layout rules hit testing and positions depend on.
const LAYOUT_CSS = `
.aui-scheduler__body { position: relative; overflow: auto; max-block-size: 600px; }
.aui-scheduler__grid { border-collapse: separate; border-spacing: 0; table-layout: fixed; inline-size: 100%; }
.aui-scheduler__cell { position: relative; padding: 0; box-sizing: border-box; }
.aui-scheduler__slot-row .aui-scheduler__cell { block-size: 24px; }
.aui-scheduler__event { position: absolute; z-index: 1; box-sizing: border-box; inline-size: 90%; block-size: 22px; overflow: hidden; padding: 0; border: 0; font-size: 10px; }
.aui-scheduler__slot-row .aui-scheduler__event { inset-block-start: calc(var(--aui-top, 0) * 24px); block-size: calc(var(--aui-span, 1) * 24px - 2px); }
.aui-scheduler__resize { position: absolute; inset-inline: 0; inset-block-end: 0; block-size: 6px; }
.aui-scheduler__event--chip { position: static; display: block; }
.aui-scheduler__cell--day { block-size: 140px; }
.aui-scheduler__more { display: block; }
.aui-visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
`;

function mount(options: Partial<Parameters<typeof Scheduler.create>[1]> = {}): { s: Scheduler; host: HTMLDivElement } {
  const host = document.createElement('div');
  host.style.setProperty('inline-size', '900px');
  const style = document.createElement('style');
  style.textContent = LAYOUT_CSS;
  document.body.append(style, host);
  const s = Scheduler.create(host, { label: 'Team calendar', events, date: plainDate(2026, 9, 29), now: NOW, timezone: ZONE, locale: 'en-GB', firstDayOfWeek: 1, ...options });
  return { s, host };
}
const eventEl = (host: HTMLElement, key: string): HTMLElement => host.querySelector<HTMLElement>(`button.aui-scheduler__event[data-aui-key="${key}"]`)!;
const cellOf = (el: Element): HTMLTableCellElement => el.closest('td')!;
const ms = (text: string): string => String(at(text).epochMilliseconds);
const range = (occStart: Instant | { kind: string }): string => ('epochMilliseconds' in occStart ? instantToString(occStart) : JSON.stringify(occStart));

describe('scheduler layout', () => {
  it('packs overlapping events side by side and extends into free columns', () => {
    const p = packColumns([
      { key: 'a', start: 0, end: 60 },
      { key: 'b', start: 30, end: 90 },
      { key: 'c', start: 60, end: 120 },
      { key: 'd', start: 200, end: 210 },
    ]);
    expect(p.get('a')).toEqual({ column: 0, columns: 2, extent: 1 });
    expect(p.get('b')).toEqual({ column: 1, columns: 2, extent: 1 });
    expect(p.get('c')).toEqual({ column: 0, columns: 2, extent: 1 });
    expect(p.get('d')).toEqual({ column: 0, columns: 1, extent: 1 });
    const lanes = packLanes([{ key: 'x', start: 0, end: 3 }, { key: 'y', start: 1, end: 2 }, { key: 'z', start: 3, end: 5 }]);
    expect([lanes.lanes.get('x'), lanes.lanes.get('y'), lanes.lanes.get('z'), lanes.count]).toEqual([0, 1, 0, 2]);
  });
});

describe('scheduler model', () => {
  const week = { startDate: plainDate(2026, 9, 28), endDate: plainDate(2026, 10, 4), timeZone: ZONE };

  it('expands series, hides replaced and excluded occurrences, and keeps exceptions', () => {
    const list: SchedulerEvent[] = [
      { ...events[0]!, recurrence: rule('RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR\nEXDATE:20261001T090000') },
      { id: 'x', title: 'Standup (late)', start: at('2026-09-30T09:00:00Z'), end: at('2026-09-30T09:15:00Z'), seriesId: 'standup', originalStart: at('2026-09-30T08:00:00Z') },
    ];
    const occ = expandEvents(list, week);
    expect(occ.map((o) => [o.key, instantToString(o.start as Instant)])).toEqual([
      [`standup@${ms('2026-09-28T08:00:00Z')}`, '2026-09-28T08:00:00.000Z'],
      [`standup@${ms('2026-09-29T08:00:00Z')}`, '2026-09-29T08:00:00.000Z'],
      ['x', '2026-09-30T09:00:00.000Z'],
      [`standup@${ms('2026-10-02T08:00:00Z')}`, '2026-10-02T08:00:00.000Z'],
    ]);
    expect(occ[2]).toMatchObject({ recurring: true, seriesId: 'standup' });
  });

  it('keeps 09:00 local across the October DST change', () => {
    const occ = expandEvents([events[0]!], { startDate: plainDate(2026, 10, 23), endDate: plainDate(2026, 10, 27), timeZone: ZONE });
    expect(occ.map((o) => instantToString(o.start as Instant))).toEqual(['2026-10-23T08:00:00.000Z', '2026-10-26T09:00:00.000Z', '2026-10-27T09:00:00.000Z']);
  });

  const editOf = (scope: 'occurrence' | 'following' | 'series', minutes: number) => {
    const occ = expandEvents(events, week).find((o) => o.key === `standup@${ms('2026-10-02T08:00:00Z')}`)!;
    const start = at('2026-10-02T08:00:00Z').epochMilliseconds + minutes * 60_000;
    return applyEdit(events, {
      occurrence: occ,
      start: { kind: 'Instant', epochMilliseconds: start },
      end: { kind: 'Instant', epochMilliseconds: start + 15 * 60_000 },
      scope,
      timeZone: ZONE,
      createId: (base, hint) => `${base.id}~${hint}`,
    })!;
  };

  it('occurrence scope adds an exception', () => {
    const r = editOf('occurrence', 30);
    expect(r.changes.added).toHaveLength(1);
    expect(r.changes.added[0]).toMatchObject({ seriesId: 'standup', originalStart: at('2026-10-02T08:00:00Z') });
    expect(expandEvents(r.events, week).filter((o) => o.event.title === 'Standup').map((o) => instantToString(o.start as Instant)).at(-1)).toBe('2026-10-02T08:30:00.000Z');
  });

  it('following scope ends the series and starts a new one at the occurrence', () => {
    const r = editOf('following', 30);
    const head = r.events.find((e) => e.id === 'standup')!;
    const tail = r.events.find((e) => e.id === `standup~${ms('2026-10-02T08:00:00Z')}`)!;
    expect(head.recurrence && instantToString(head.recurrence.until as Instant)).toBe('2026-10-02T07:59:59.000Z');
    expect(tail.start).toEqual(at('2026-10-02T08:30:00Z'));
    const times = expandEvents(r.events, { ...week, endDate: plainDate(2026, 10, 6) }).filter((o) => o.event.title === 'Standup').map((o) => instantToString(o.start as Instant));
    expect(times).toEqual(['2026-09-28T08:00:00.000Z', '2026-09-29T08:00:00.000Z', '2026-09-30T08:00:00.000Z', '2026-10-01T08:00:00.000Z', '2026-10-02T08:30:00.000Z', '2026-10-05T08:30:00.000Z', '2026-10-06T08:30:00.000Z']);
  });

  it('series scope moves every occurrence by the wall-clock delta', () => {
    const r = editOf('series', 45);
    const times = expandEvents(r.events, week).filter((o) => o.seriesId === 'standup').map((o) => instantToString(o.start as Instant));
    expect(times[0]).toBe('2026-09-28T08:45:00.000Z');
    expect(times).toHaveLength(5);
  });
});

describe('scheduler week view', () => {
  it('renders a grid with day headers, an all-day row, and slots', () => {
    const { s, host } = mount();
    const grid = host.querySelector('table[role="grid"]')!;
    expect(grid.getAttribute('aria-label')).toBe('Team calendar, 28 Sept – 4 Oct 2026');
    expect(host.querySelector('.aui-scheduler__title')?.textContent).toBe('28 Sept – 4 Oct 2026');
    expect([...grid.querySelectorAll('thead th')].map((th) => th.getAttribute('abbr') ?? th.textContent)).toEqual(['Time', 'Monday, 28 September 2026', 'Tuesday, 29 September 2026', 'Wednesday, 30 September 2026', 'Thursday, 1 October 2026', 'Friday, 2 October 2026', 'Saturday, 3 October 2026', 'Sunday, 4 October 2026']);
    expect(grid.querySelectorAll('tbody tr')).toHaveLength(1 + 48);
    expect(s.occurrences).toHaveLength(9);
    const review = eventEl(host, 'review');
    expect(review.getAttribute('aria-label')).toBe('Design review, 10:00 to 11:30, Tuesday, 29 September 2026, Room 4');
    expect(cellOf(review).getAttribute('aria-label')).toBe('Tuesday 29 September, 10:00 to 10:30, 1 event');
    expect(review.style.getPropertyValue('--aui-span')).toBe('3');
    // Overlap: Design review and Lunch share the day column.
    expect([review.style.getPropertyValue('--aui-column'), eventEl(host, 'lunch').style.getPropertyValue('--aui-column'), review.style.getPropertyValue('--aui-columns')]).toEqual(['0', '1', '2']);
    expect(eventEl(host, 'offsite').closest('tr')?.classList.contains('aui-scheduler__all-day-row')).toBe(true);
    expect(eventEl(host, 'offsite').style.getPropertyValue('--aui-span')).toBe('2');
    expect(eventEl(host, `standup@${ms('2026-09-28T08:00:00Z')}`).getAttribute('aria-label')).toContain('repeats every weekday');
    expect(host.querySelectorAll('.aui-scheduler__now')).toHaveLength(1);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(host.querySelectorAll('.aui-scheduler__cell--non-working').length).toBeGreaterThan(0);
  });

  it('keyboard: arrows move over cells, Enter enters events, Escape leaves, PageDown pages', async () => {
    const { s, host } = mount();
    const navs: SchedulerNavigateDetail[] = [];
    host.addEventListener('aui-navigate', (e) => navs.push((e as CustomEvent<SchedulerNavigateDetail>).detail));
    s.focus();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Tuesday 29 September, 08:00 to 08:30, non-working time');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Tuesday 29 September, 10:00 to 10:30, 1 event');
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement?.getAttribute('data-aui-key')).toBe('review');
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement?.tagName).toBe('TD');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Wednesday 30 September, 10:00/);
    await userEvent.keyboard('{PageDown}');
    expect(s.range.startDate).toEqual(plainDate(2026, 10, 5));
    expect(navs.at(-1)?.view).toBe('week');
    expect(host.contains(document.activeElement)).toBe(true);
  });

  it('Enter on an empty slot and Shift+Arrow selections ask to create events', async () => {
    const { s, host } = mount();
    const slots: SchedulerSlotActivateDetail[] = [];
    host.addEventListener('aui-slot-activate', (e) => slots.push((e as CustomEvent<SchedulerSlotActivateDetail>).detail));
    s.focus();
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(slots.at(-1)).toMatchObject({ allDay: false, resourceId: null });
    expect([range(slots.at(-1)!.start), range(slots.at(-1)!.end)]).toEqual(['2026-09-30T07:00:00.000Z', '2026-09-30T07:30:00.000Z']);
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}{Enter}');
    expect([range(slots.at(-1)!.start), range(slots.at(-1)!.end)]).toEqual(['2026-09-30T07:00:00.000Z', '2026-09-30T08:30:00.000Z']);
  });

  it('keyboard move with Ctrl+X / Ctrl+V, undo, redo, and a cancelable change', async () => {
    const { s, host } = mount({ editable: true });
    const changes: SchedulerEventChangeDetail[] = [];
    host.addEventListener('aui-event-change', (e) => changes.push((e as CustomEvent<SchedulerEventChangeDetail>).detail));
    // Cut, then Escape twice: the first leaves the event, the second cancels the cut.
    eventEl(host, 'review').focus();
    await userEvent.keyboard('{Control>}x{/Control}{Escape}');
    expect(host.querySelector('.aui-scheduler__event--cut')).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(host.querySelector('.aui-scheduler__event--cut')).toBeNull();
    // Cut the review and paste it on Wednesday 11:00.
    eventEl(host, 'review').focus();
    await userEvent.keyboard('{Control>}x{/Control}{Escape}');
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{ArrowDown}{Control>}v{/Control}');
    expect(changes.at(-1)).toMatchObject({ reason: 'move', scope: 'occurrence' });
    expect(changes.at(-1)?.changes.updated.map((e) => [e.id, instantToString(e.start as Instant)])).toEqual([['review', '2026-09-30T10:00:00.000Z']]);
    expect(document.activeElement?.getAttribute('data-aui-key')).toBe('review');
    expect(s.canUndo).toBe(true);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(s.events.find((e) => e.id === 'review')?.start).toEqual(at('2026-09-29T09:00:00Z'));
    expect(changes.at(-1)?.reason).toBe('undo');
    s.redo();
    expect(s.events.find((e) => e.id === 'review')?.start).toEqual(at('2026-09-30T10:00:00Z'));
    host.addEventListener('aui-event-change', (e) => {
      e.preventDefault();
    }, { once: true });
    expect(s.moveEvent('review', at('2026-09-30T12:00:00Z'))).toBe(false);
    expect(s.events.find((e) => e.id === 'review')?.start).toEqual(at('2026-09-30T10:00:00Z'));
  });

  it('Shift+ArrowDown resizes by the snap; read-only events refuse', async () => {
    const { s, host } = mount({ editable: true });
    eventEl(host, 'review').focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(s.events.find((e) => e.id === 'review')?.end).toEqual(at('2026-09-29T10:45:00Z'));
    eventEl(host, 'deploy').focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(s.events.find((e) => e.id === 'deploy')?.end).toEqual(at('2026-10-02T13:00:00Z'));
    expect(eventEl(host, 'deploy').getAttribute('aria-label')).toContain('read-only');
  });

  it('recurring occurrences: configured scope, and the scope dialog', async () => {
    const { s, host } = mount({ editable: true, recurringEditScope: 'occurrence' });
    expect(s.moveEvent('standup@1790841600000', at('2026-10-02T08:30:00Z'))).toBe(true);
    expect(s.events.filter((e) => e.seriesId === 'standup')).toHaveLength(1);
    s.destroy();
    host.remove();
    const second = mount({ editable: true });
    const changes: SchedulerEventChangeDetail[] = [];
    second.host.addEventListener('aui-event-change', (e) => changes.push((e as CustomEvent<SchedulerEventChangeDetail>).detail));
    eventEl(second.host, `standup@${ms('2026-09-29T08:00:00Z')}`).focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    const dialog = document.querySelector('dialog[open]')!;
    expect(dialog.textContent).toContain('Standup repeats. Which events should change?');
    await userEvent.click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'All events')!);
    expect(changes.at(-1)).toMatchObject({ reason: 'resize', scope: 'series' });
    expect(second.s.events.find((e) => e.id === 'standup')?.end).toEqual(at('2026-09-28T08:30:00Z'));
  });

  it('pointer drag moves an event to another day and time', async () => {
    const { s, host } = mount({ editable: true, view: 'day' });
    const review = eventEl(host, 'review');
    const target = [...host.querySelectorAll<HTMLTableCellElement>('td[aria-label]')].find((td) => td.getAttribute('aria-label')?.startsWith('Tuesday 29 September, 13:00'))!;
    // Both the event and the target row in view.
    host.querySelector<HTMLElement>('.aui-scheduler__body')!.scrollTop = review.closest('tr')!.offsetTop - 60;
    const a = review.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    review.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: a.left + 5, clientY: a.top + 5, isPrimary: true }));
    review.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: a.left + 5, clientY: a.top + 20, isPrimary: true }));
    review.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: b.left + 5, clientY: b.top + 5, isPrimary: true }));
    review.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: b.left + 5, clientY: b.top + 5, isPrimary: true }));
    await Promise.resolve();
    expect(s.events.find((e) => e.id === 'review')?.start).toEqual(at('2026-09-29T12:00:00Z'));
  });
});

describe('scheduler other views', () => {
  it('month view: bars, chips, and "+N more" that opens the day', async () => {
    const many: SchedulerEvent[] = [...events, ...Array.from({ length: 4 }, (_, i): SchedulerEvent => ({ id: `m${String(i)}`, title: `Meeting ${String(i)}`, start: at(`2026-09-29T1${String(i)}:00:00Z`), end: at(`2026-09-29T1${String(i)}:30:00Z`) }))];
    const { s, host } = mount({ view: 'month', events: many });
    expect(host.querySelectorAll('tbody tr')).toHaveLength(5);
    const offsite = eventEl(host, 'offsite');
    expect(offsite.classList.contains('aui-scheduler__event--bar')).toBe(true);
    const tuesday = cellOf(eventEl(host, 'review'));
    expect(tuesday.getAttribute('aria-label')).toBe('Tuesday, 29 September 2026, 7 events');
    const more = tuesday.querySelector<HTMLButtonElement>('.aui-scheduler__more')!;
    expect(more.textContent).toBe('+5 more');
    s.focus();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Tuesday, 29 September 2026, 7 events');
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement?.getAttribute('data-aui-key')).toBe(`standup@${ms('2026-09-29T08:00:00Z')}`);
    await userEvent.click(more);
    expect(s.view).toBe('day');
    expect(s.date).toEqual(plainDate(2026, 9, 29));
  });

  it('agenda view lists days with one roving tab stop', async () => {
    const { s, host } = mount({ view: 'agenda', date: plainDate(2026, 9, 29), agendaDays: 3 });
    expect([...host.querySelectorAll('.aui-scheduler__agenda-date')].map((h) => h.textContent)).toEqual(['Tuesday, 29 September 2026', 'Wednesday, 30 September 2026', 'Thursday, 1 October 2026']);
    expect(host.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
    s.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('data-aui-key')).toBe('review');
  });

  it('timeline view: resource rows, unassigned row, and virtual rows for large lists', () => {
    const resources = [{ id: 'r1', label: 'Room 1' }, { id: 'r2', label: 'Room 2' }];
    const list: SchedulerEvent[] = [{ ...events[1]!, resourceId: 'r2' }, events[2]!];
    const { host } = mount({ view: 'timeline', resources, events: list, dayStartHour: 8, dayEndHour: 18 });
    expect([...host.querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual(['Room 1', 'Room 2', 'Unassigned']);
    expect(host.querySelectorAll('thead th')).toHaveLength(1 + 20);
    const review = eventEl(host, 'review');
    expect(review.closest('tr')?.querySelector('th')?.textContent).toBe('Room 2');
    expect(review.style.getPropertyValue('--aui-span')).toBe('3');
    expect(cellOf(review).getAttribute('aria-label')).toBe('Room 2, Tuesday 29 September, 10:00 to 10:30, 1 event');
    document.body.replaceChildren();
    const big = Array.from({ length: 300 }, (_, i) => ({ id: `r${String(i)}`, label: `Room ${String(i)}` }));
    const { host: host2 } = mount({ view: 'timeline', resources: big, events: [] });
    expect(host2.querySelectorAll('tbody tr.aui-scheduler__resource-row').length).toBeLessThan(80);
    expect(host2.querySelector('table')?.getAttribute('aria-rowcount')).toBe('301');
  });

  it('loads events by range, cancels superseded requests, and reports failures', async () => {
    const calls: { range: SchedulerRange; signal: AbortSignal }[] = [];
    let fail = false;
    const { s, host } = mount({
      events: [],
      loadEvents: (r, signal) => {
        calls.push({ range: r, signal });
        return fail ? Promise.reject(new Error('down')) : Promise.resolve(events);
      },
    });
    expect(s.loading).toBe(true);
    expect(host.querySelector('table')?.getAttribute('aria-busy')).toBe('true');
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.loading).toBe(false);
    expect(instantToString(calls[0]!.range.start)).toBe('2026-09-27T23:00:00.000Z');
    expect(s.occurrences.length).toBeGreaterThan(0);
    const errors: SchedulerLoadErrorDetail[] = [];
    host.addEventListener('aui-load-error', (e) => errors.push((e as CustomEvent<SchedulerLoadErrorDetail>).detail));
    fail = true;
    s.next();
    s.next();
    expect(calls.at(-2)?.signal.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(errors).toHaveLength(1);
    expect(host.querySelector('.aui-scheduler__status')?.textContent).toContain('Events could not be loaded.');
    fail = false;
    host.querySelector<HTMLButtonElement>('.aui-scheduler__retry')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelector<HTMLElement>('.aui-scheduler__status')?.hidden).toBe(true);
    // Retry clears the cache; a range loaded since then is served from it.
    s.previous();
    await new Promise((r) => setTimeout(r, 0));
    s.next();
    expect(s.loading).toBe(false);
  });

  it('refuses invalid answers from loadEvents', async () => {
    const { host } = mount({ events: [], loadEvents: () => Promise.resolve([{ id: 'x' } as unknown as SchedulerEvent]) });
    const errors: SchedulerLoadErrorDetail[] = [];
    host.addEventListener('aui-load-error', (e) => errors.push((e as CustomEvent<SchedulerLoadErrorDetail>).detail));
    await new Promise((r) => setTimeout(r, 0));
    expect(String(errors[0]?.error)).toMatch(/SCHEDULER_DATA_SOURCE/);
  });

  it('switches views from the toolbar and validates options', async () => {
    const { s, host } = mount();
    const month = [...host.querySelectorAll<HTMLButtonElement>('.aui-scheduler__view')].find((b) => b.textContent === 'Month')!;
    await userEvent.click(month);
    expect(s.view).toBe('month');
    expect(month.getAttribute('aria-pressed')).toBe('true');
    expect(() => Scheduler.create(document.createElement('div'), { label: '' })).toThrow(/SCHEDULER_OPTIONS/);
    expect(() => Scheduler.create(document.createElement('div'), { label: 'x', events: [{ id: 'a', title: 'A', start: at('2026-01-01T10:00:00Z'), end: at('2026-01-01T09:00:00Z') }] })).toThrow(AbsoluteUIError);
    expect(() => { s.update({ dayStartHour: 10, dayEndHour: 9 }); }).toThrow(/dayEndHour/);
    s.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
