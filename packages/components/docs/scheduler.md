# Scheduler

> Package: `@absoluteui/components/scheduler` | Styles: `@absoluteui/components/scheduler/style.css`, plus `@absoluteui/components/button/style.css` and `@absoluteui/components/dialog/style.css` (the recurring-change prompt) | Since 0.6.0 | Status: R3

## 1. Purpose

Shows and edits events over time. One component covers SPEC section 18.19 Scheduler, Calendar Scheduler (day, week, work week, month, agenda), and Timeline Scheduler (resource rows over the slots of a day, or the days of a week or month).

Events are timed (`Instant` start and exclusive end) or all-day (`PlainDate` start and inclusive last day), laid out in the scheduler timezone by their wall-clock times. Recurring series use `RecurrenceRule` (RRULE subset from `@absoluteui/core`) with EXDATE cancellations and exception events (`seriesId` + `originalStart`). A Business Calendar definition supplies the work week, business-hours shading, and holidays.

In edit mode events move and resize by pointer drag, by Ctrl/Cmd+X then Ctrl/Cmd+V, by Shift+Arrow keys, and by toolbar buttons (single pointer). Changes to a recurring occurrence apply to that occurrence, this and following, or the whole series (asked in a dialog, or configured). Every change is dispatched first as the cancelable `aui-event-change` with the changes and every event, and is undoable. Events come from `events` or from `loadEvents` per visible range (cancellable, timed out, validated, cached). Enter on an empty cell, selections, pointer ranges, and double-clicks emit `aui-slot-activate` so the application can create events.

## 2. Anatomy

```text
<div class="aui-scheduler aui-scheduler--week [--editable]" dir="ltr">                  (consumer host)
  <div class="aui-scheduler__toolbar" role="toolbar" aria-label="{label} controls">
    <div class="aui-scheduler__nav"> Today | Previous week | Next week
    <h2 class="aui-scheduler__title" aria-live="polite">28 Sept - 4 Oct 2026</h2>
    <div class="aui-scheduler__views" role="group" aria-label="View"> Day | Week (aria-pressed) | Work week | Month | Agenda | Timeline
    <div class="aui-scheduler__edit" role="group" aria-label="Editing"> Move | Move here | Shorten | Lengthen | Undo | Redo
  <div class="aui-scheduler__status" role="status" hidden>                               (loading, error + Retry)
  <div class="aui-scheduler__body">                                                     (scrolls both ways)
    <table class="aui-scheduler__grid aui-scheduler__grid--time" role="grid" aria-label="{label}, {period}">
      <thead><tr><th class="__corner">Time</th><th class="__day-header" abbr="Tuesday, 29 September 2026">Tue 29 [holiday]</th>...
      <tbody>
        <tr class="__all-day-row"><th>All day</th><td class="__cell --all-day" aria-label="...">
              <button class="aui-scheduler__event --c1 --all-day" data-aui-key="offsite" aria-label="Offsite, 30 Sept 2026 to 1 Oct 2026">...
        <tr class="__slot-row --hour"><th class="__time">09:00</th>
          <td class="aui-scheduler__cell [--non-working] [--selected]" aria-label="Tuesday 29 September, 09:00 to 09:30, 1 event" tabindex="0|-1">
            <button class="aui-scheduler__event --c3" data-aui-key="review" aria-label="Design review, 10:00 to 11:30, …, Room 4"
                    style="--aui-top:0; --aui-span:3; --aui-column:0; --aui-columns:2; --aui-extent:1">
              <span class="__event-content"><span class="__event-time">10:00</span> <span class="__event-title">Design review</span> ...</span>
              <span class="aui-scheduler__resize" aria-hidden="true">                  (edit mode)
            <span class="aui-scheduler__now" aria-hidden="true">                         (current time)
```

Month: one row per week; day cells hold the date, bars (`__event--bar`, spanning `--aui-span` cells in lanes `--aui-lane`), chips (`__event--chip`), and "+N more" (`__more`). Timeline: row headers are resources (plus "Unassigned"), bars are placed by `--aui-offset`/`--aui-span` in column units. Agenda: `section.__agenda-day > h3 + ul.__agenda-list > li > time + event button`.

## 3. When to use

- Team calendars, room or equipment booking, shift or appointment planning.
- Resource planning where rows are people, rooms, or machines (timeline).
- Calendars where events repeat and timezones and DST must be exact.

## 4. When not to use

- Project plans with dependencies: Gantt.
- Picking a date or a time range: Date Picker, Schedule Picker.
- Tens of thousands of events in one visible range: aggregate on the server.

## 5. Public properties

`SchedulerOptions`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | required | Grid name "{label}, {period}"; toolbar "{label} controls". |
| `events` | `readonly SchedulerEvent[]` | `[]` | See section 32. |
| `loadEvents` | `(range, signal) => Promise<SchedulerEvent[]>` | - | Range data source. |
| `resources` | `readonly SchedulerResource[]` | - | Timeline rows. |
| `view` | `SchedulerView` | `'week'` | `day`, `week`, `workWeek`, `month`, `agenda`, `timeline`. |
| `views` | `SchedulerView[]` | five (+ timeline with resources) | Switcher. |
| `date` | `PlainDate` | today | A day in the period. |
| `editable` | `boolean` | `false` | |
| `recurringEditScope` | `'ask' \| 'occurrence' \| 'following' \| 'series'` | `'ask'` | |
| `businessCalendar` | `BusinessCalendarDefinition` | Mon-Fri 09-17 | Work week, shading, holidays. |
| `firstDayOfWeek` | `IsoWeekday` | locale | |
| `createId` | `(base, hint) => string` | `{id}~{hint}` | New event ids (made unique). |
| `renderEvent` | `(occurrence, { view, doc }) => Node` | default | Non-interactive content. Released with `releaseNode()` on the next full render and on destroy (since 0.9.0). |
| `now` | `Instant` | clock | Advanced: fixed time. |
| `icons` | `{ previous, next }` | chevrons | |
| `slotDuration` | `15 \| 30 \| 60` | `30` | Global. |
| `snapDuration` | `5 \| 10 \| 15 \| 30 \| 60` | `15` | Global. |
| `dayStartHour` / `dayEndHour` | `number` | `0` / `24` | Global. |
| `scrollToHour` | `number` | `8` | Global. |
| `monthEventLimit` | `number` | `3` | Global. |
| `agendaDays` | `number` | `7` | Global. |
| `timelineScale` | `'day' \| 'week' \| 'month'` | `'day'` | Global. |
| `requestTimeoutMs` | `number` | `30000` | Global. |
| `historyLimit` | `number` | `50` | Global. |
| `locale`, `timezone`, `disambiguation`, `direction` | | common | Inherited. |

Controller properties: `host`, `view`, `date`, `range`, `events`, `occurrences`, `editable`, `loading`, `canUndo`, `canRedo`, `businessCalendar`, `element`.

## 6. Methods

| Method | Description |
|---|---|
| `Scheduler.create(host, options)` | Validate and render (and load). |
| `update(options)` | Merge options; `events` replaces the list and clears history. |
| `setView(view)`, `goTo(date)`, `today()` | Change view or period (no event). |
| `next()`, `previous()` | Next / previous period (`aui-navigate`). |
| `refresh()` | Drop cached ranges; reload. |
| `moveEvent(key, start, { resourceId?, scope? })` | Programmatic move; cancelable; returns false when refused. |
| `resizeEvent(key, end, { scope? })` | Programmatic end change. |
| `undo()`, `redo()` | History (cancelable `aui-event-change` with `reason`). |
| `focus()`, `destroy()` | |
| `expandEvents(events, range)` | Pure: occurrences of events for days in a timezone. |
| `applyEdit(events, request)` | Pure: new events and changes for a move or resize with a scope. |
| `packColumns(spans)`, `packLanes(spans)` | Pure layout helpers. |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-navigate` | `SchedulerNavigateDetail { view; date; range }` | Toolbar, PageUp/PageDown, arrows past the edge, "+N more". |
| `aui-slot-activate` | `SchedulerSlotActivateDetail { start; end; allDay; resourceId }` | Create request. |
| `aui-event-activate` | `SchedulerEventActivateDetail { occurrence; event }` | Click, Enter, Space. |
| `aui-event-change` | `SchedulerEventChangeDetail { reason; occurrence; scope; changes: { added; updated; removed }; events }` | Cancelable, before applying. |
| `aui-event-delete` | `SchedulerEventDeleteDetail { occurrence; event }` | Delete/Backspace (edit mode); the application removes the event. |
| `aui-load-error` | `SchedulerLoadErrorDetail { range; error }` | Failure, timeout, invalid answer. |

All events bubble; only `aui-event-change` is cancelable.

## 8. Slots/content areas

`renderEvent(occurrence, { view, doc })` returns event content (inserted inside the event button; keep it non-interactive, its text is not the accessible name - the name is generated from title, time, location, and recurrence).

## 9. CSS parts/hooks

See `metadata/scheduler/api.json` (`cssClasses`). Sizing custom properties on the host: `--aui-scheduler-slot` (slot height, 1.5rem), `--aui-scheduler-lane` (bar height, 1.5rem), `--aui-scheduler-date` (month date row, 1.75rem), `--aui-scheduler-height` (body max height, 36rem).

## 10. Design tokens

See `metadata/scheduler/tokens.json`. Key tokens: `color-chart-1`..`8` (event colors), `color-surface` and `color-surface-sunken` (working and non-working time), `color-border`, `color-border-strong`, `color-selected` (selection, pressed view), `color-error-fg` (current time), `color-warning-fg` (holidays), `color-link` ("+N more").

## 11. States

Views; loading (`aria-busy`, status); load error (status with Retry); edit mode; cut (move pending); dragging; resizing; selection; recurring-scope dialog.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| cell | Enter / F2 | first event of the cell (or "+N more") |
| empty cell or selection | Enter, Shift+Enter, pointer range, double-click | `aui-slot-activate` |
| event | Ctrl/Cmd+X or Move | cut (dashed); Escape on a cell cancels |
| cut | Ctrl/Cmd+V or Move here on a cell | moved (dialog first for recurring when `ask`) |
| event | drag / resize handle / Shift+Arrow / Shorten / Lengthen | moved or resized |
| change requested | `preventDefault()` on `aui-event-change` | unchanged |
| changed | Ctrl/Cmd+Z / Undo | previous events (`reason: 'undo'`) |
| range | navigation | `loadEvents` (older request aborted) -> loaded, or error with Retry |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Scheduler | Toolbar, then the grid (one tab stop). |
| Arrow keys | Cell | Move (mirrored in RTL); past the edge: next or previous period. |
| Home / End (Ctrl/Cmd) | Cell | Row start / end (grid start / end). |
| PageUp / PageDown | Cell, agenda | Previous / next period. |
| Shift+Arrow | Cell | Extend the selection. |
| Enter / F2 | Cell | Into the cell's events, or create (empty cell or selection). |
| Shift+Enter | Cell | Create. |
| Escape | Cell | Clear the selection; cancel a pending move. |
| ArrowUp / ArrowDown | Event | Previous / next event in the cell. |
| Enter / Space | Event | Activate. |
| Escape / F2 | Event | Back to the cell. |
| Ctrl/Cmd+X, Ctrl/Cmd+V | Event, cell (edit mode) | Move. |
| Shift+ArrowDown / ArrowUp | Timed event, time views (edit) | Lengthen / shorten by `snapDuration`. |
| Shift+ArrowRight / ArrowLeft | Bars, timeline (edit) | Lengthen / shorten by a day or a snap. |
| Delete / Backspace | Event (edit) | `aui-event-delete`. |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y | Grid (edit) | Undo / redo. |

## 14. ARIA contract

- Grids are `table role="grid"` named "{label}, {period}"; headers are `th` with `scope` (day headers carry the full date in `abbr`, today `aria-current="date"`); cells are gridcells with names stating date, slot, resource, non-working time, holiday, and event count; one element has `tabindex="0"`.
- Events are `button`s inside their start cell, named by title, time or dates, location, "repeats ...", and "read-only"; continuation segments and the current-time line are `aria-hidden`.
- Selections set `aria-selected="true"` on cells.
- The toolbar is `role="toolbar"`; view buttons use `aria-pressed`; unavailable edit buttons use `aria-disabled` (still focusable).
- The period title is a polite live region; loading and errors use `role="status"`; `aria-busy` marks the grid while loading.
- Virtual timelines set `aria-rowcount` and `aria-rowindex`.
- Announcements: moves, resizes, undo, redo (polite); ready to move, not allowed, load failed (assertive).

## 15. Accessibility notes

- Moving and resizing never require dragging (WCAG 2.5.7): cut and paste, Shift+Arrow keys, and toolbar Move / Move here / Shorten / Lengthen.
- Colors are never the only cue; non-working time is named and hatched in forced colors.
- Continuation segments of multi-day events are hidden from assistive technology; the first segment carries the event.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

Toolbar wraps. The body scrolls in two dimensions with sticky headers (WCAG 1.4.10 exempts data grids); minimum column widths: 6rem per day, 3rem per timeline column, 42rem for months. Use `views` (for example agenda and day) on phones.

## 17. RTL behavior

`direction: 'rtl'` mirrors column order, timeline flow, chevrons, Left/Right keys, and Shift+Left/Right resizing.

## 18. Theme behavior

Events: chart palette bar and 18 % tint over the surface, body text. Non-working time: sunken surface. Current time: error-colored line. Forced colors: CanvasText outlines, hatched non-working time, Highlight selection; reduced motion removes drag shadows.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { scheduler: { slotDuration: 15, dayStartHour: 7, dayEndHour: 21, scrollToHour: 9, timelineScale: 'week' } } });
```

Global options: `slotDuration`, `snapDuration`, `dayStartHour`, `dayEndHour`, `scrollToHour`, `monthEventLimit`, `agendaDays`, `timelineScale`, `requestTimeoutMs`, `historyLimit`, plus inherited `locale`, `timezone`, `disambiguation`, `direction`.

## 20. Component configuration support

Instance options override global and theme defaults; all are dynamic through `update()` (`dayEndHour` must stay after `dayStartHour`).

## 21. Timezone behavior

The layout timezone is the configured `timezone` (UTC unless configured, SPEC section 8.1), never the host zone. Timed events are exact instants positioned by their wall-clock time in that zone; on DST days rows are wall-clock slots (a skipped hour still has its slot; creating there resolves with the disambiguation policy, compatible by default). Series expand in the event's `timeZone` (default the scheduler zone): a 09:00 London standup stays at 09:00 London across both DST changes, and is shown at the matching wall-clock time in other scheduler zones. Moves keep the real duration and the wall-clock time on day cells; recurring series edits shift the rule by the wall-clock delta (weekly BYDAY and positive BYMONTHDAY follow day shifts; EXDATE/RDATE move too). `loadEvents` receives instants of local midnights.

## 22. Icon customization points

`previous` (`chevron-left`), `next` (`chevron-right`), swapped in RTL. Toolbar: `grip` (Move), `check` (Move here), `minus`, `plus`, `undo`, `redo`, `refresh` (Retry).

## 23. Security behavior

Titles, locations, and names render through `textContent`; `renderEvent` returns application DOM. Positions are CSS custom properties set through the CSSOM (CSP-safe). Events and data-source answers are validated before use (`SCHEDULER_OPTIONS`, `SCHEDULER_DATA_SOURCE`). `loadEvents` receives an `AbortSignal` and times out.

## 24. Data handling behavior

No persistence or telemetry. Loaded ranges are cached in memory until an edit, `refresh()`, or `update({ loadEvents })`. Edits are reported through `aui-event-change` (`changes` and every event); save them and roll back with `undo()` or `update({ events })` when the server refuses.

## 25. Performance characteristics

Each render rebuilds the view (a week has 336 slot cells; timelines above 60 resources render only the rows in view). Series expand per visible range with fast-forward when there is no COUNT. Budgets (e2e): week view with 300 events create < 120 ms; next period in a month with 1,000 events (200 recurring) < 120 ms; timeline with 500 resources and 2,000 events create < 150 ms.

## 26. Supported data scale

Tested with 1,000 occurrences per visible range and 500 timeline resources; the undo history keeps 50 snapshots by default.

## 27. Usage examples

See section 33 and `metadata/scheduler/examples.json`: team week, editing with save and rollback, rooms timeline from a data source, global configuration.

## 28. Edge cases

- Overlapping timed events share the day width; an event extends into free columns to its right.
- Multi-day timed events show one segment per day in time views and a bar in month and timeline views.
- Events outside `dayStartHour`..`dayEndHour` are clipped to the visible hours.
- An exception event replaces its occurrence; EXDATE cancels one; moving an exception with "All events" moves the series.
- "This and following" on the first occurrence edits the whole series; COUNT is split between the two series.
- Month cells show `monthEventLimit` rows; hidden events are counted in "+N more" and in the cell name.
- A drop that changes nothing emits no event.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SCHEDULER_OPTIONS` | configuration | Empty label; invalid events (ids, kinds, end before start, exceptions without originalStart, recurrence on an exception), resources, views, date, callbacks, business calendar, hours; `moveEvent`/`resizeEvent` with unknown keys or wrong kinds. |
| `SCHEDULER_DATA_SOURCE` | configuration | `loadEvents` answered invalid events (reported through `aui-load-error`). |
| `BUSINESS_CALENDAR_DEFINITION` | configuration | Invalid `businessCalendar`. |

A failed construction leaves the host untouched.

## 30. Known limitations

- No conversion between all-day and timed by dragging; multi-day timed events are not shown in the all-day row.
- Fixed timeline scales (day slots, week days, month days).
- Deleting and creating are delegated to the application.
- One resource per event.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML in titles; drag and drop from outside; printing layouts.

## 32. TypeScript definitions

```ts
interface SchedulerEvent {
  id: string; title: string;
  start: Instant | PlainDate; end: Instant | PlainDate;          // timed: exclusive end; all-day: inclusive last day
  timeZone?: string; recurrence?: RecurrenceRule | null;
  seriesId?: string; originalStart?: Instant | PlainDate;         // exception of a series occurrence
  resourceId?: string; color?: number; location?: string; description?: string; readOnly?: boolean;
}
interface SchedulerResource { id: string; label: string; description?: string; color?: number }
interface SchedulerOccurrence { key: string; event: SchedulerEvent; start: Instant | PlainDate; end: Instant | PlainDate; allDay: boolean; recurring: boolean; seriesId: string | null; originalStart: Instant | PlainDate | null }
type SchedulerView = 'day' | 'week' | 'workWeek' | 'month' | 'agenda' | 'timeline';
type SchedulerEditScope = 'occurrence' | 'following' | 'series';
interface SchedulerRange { start: Instant; end: Instant; startDate: PlainDate; endDate: PlainDate }
interface SchedulerEventChanges { added: SchedulerEvent[]; updated: SchedulerEvent[]; removed: string[] }
interface SchedulerEventChangeDetail { reason: 'move' | 'resize' | 'undo' | 'redo'; occurrence: SchedulerOccurrence | null; scope: SchedulerEditScope | null; changes: SchedulerEventChanges; events: SchedulerEvent[] }
interface SchedulerSlotActivateDetail { start: Instant | PlainDate; end: Instant | PlainDate; allDay: boolean; resourceId: string | null }
```

## 33. Vanilla JS example

```ts
import { parseInstant, parseRecurrenceRule, plainDate } from '@absoluteui/core';
import { Scheduler, type SchedulerEvent, type SchedulerEventChangeDetail } from '@absoluteui/components/scheduler';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/dialog/style.css';
import '@absoluteui/components/scheduler/style.css';

const at = (text: string) => parseInstant(text) ?? parseInstant('1970-01-01T00:00:00Z')!;
let saved: SchedulerEvent[] = [
  { id: 'standup', title: 'Standup', start: at('2026-09-28T08:00:00Z'), end: at('2026-09-28T08:15:00Z'), timeZone: 'Europe/London', recurrence: parseRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') },
  { id: 'offsite', title: 'Offsite', start: plainDate(2026, 10, 1), end: plainDate(2026, 10, 2) },
];
const host = document.querySelector<HTMLElement>('#calendar');
if (host) {
  Scheduler.create(host, { label: 'Team calendar', events: saved, editable: true, timezone: 'Europe/London', businessCalendar: { workingDays: [1, 2, 3, 4, 5] } });
  host.addEventListener('aui-event-change', (event) => {
    saved = (event as CustomEvent<SchedulerEventChangeDetail>).detail.events;
  });
}
```

## 34. Angular example

`<aui-scheduler>` is generated: inputs mirror `SchedulerOptions`; `[(view)]`, `[(date)]`, and `[(events)]` are two-way; outputs `navigate`, `slotActivated`, `eventActivated`, `eventChange`, `eventDeleted`, `loadError`; methods such as `setView()`, `goTo()`, `undo()`.

```ts
import { Component } from '@angular/core';
import type { SchedulerEvent, SchedulerEventChangeDetail, SchedulerSlotActivateDetail } from '@absoluteui/components/scheduler';
import { AuiScheduler } from '@absoluteui/angular/scheduler';

@Component({
  selector: 'app-calendar',
  imports: [AuiScheduler],
  template: `<aui-scheduler label="Team" [events]="events" [editable]="true" view="workWeek" timezone="Europe/London"
    (eventChange)="events = $event.events" (slotActivated)="create($event)"></aui-scheduler>`,
})
export class CalendarComponent {
  events: SchedulerEvent[] = [];

  create(slot: SchedulerSlotActivateDetail): void {
    // open an editor for slot.start .. slot.end
  }

  saved(detail: SchedulerEventChangeDetail): number {
    return detail.changes.updated.length;
  }
}
```

## 35. React example

```tsx
import { useState } from 'react';
import type { SchedulerEvent } from '@absoluteui/components/scheduler';
import { AuiScheduler } from '@absoluteui/react/scheduler';

export function TeamCalendar({ initial }: { initial: SchedulerEvent[] }) {
  const [events, setEvents] = useState(initial);
  return (
    <AuiScheduler
      label="Team"
      events={events}
      editable
      view="week"
      timezone="Europe/London"
      onEventChange={(d) => { setEvents(d.events); }}
      onSlotActivate={(d) => { console.info('create', d.start, d.end); }}
    />
  );
}
```

Passing the emitted `events` back through `events` keeps React the source of truth (it clears the scheduler's undo history; omit it and use `ref` to keep undo). See [docs/REACT.md](../../../docs/REACT.md). Load the stylesheets listed in the header of this document.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { SchedulerEvent, SchedulerEventChangeDetail } from '@absoluteui/components/scheduler';
import { AuiScheduler } from '@absoluteui/vue/scheduler';

const events = ref<SchedulerEvent[]>([]);
const save = (detail: SchedulerEventChangeDetail) => (events.value = detail.events);
</script>

<template>
  <AuiScheduler label="Team" :events="events" editable view="month" timezone="Europe/London" @event-change="save" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
