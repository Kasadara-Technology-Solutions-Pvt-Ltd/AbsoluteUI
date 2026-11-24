# Gantt Chart

> Package: `@absoluteui/components/gantt` | Styles: `@absoluteui/components/gantt/style.css` | Since 0.7.0 | Status: R3

## 1. Purpose

A project schedule. A task tree grid (name, start, end, duration, and optionally progress, resources, float) sits beside a timeline of bars with summary tasks, milestones, progress, baselines, dependency connectors, the critical path, non-working days, and today. An optional histogram shows each resource's daily load against its capacity.

Tasks are scheduled in working days of a Business Calendar. Dependencies (finish-to-start, start-to-start, finish-to-finish, start-to-finish, with lag or lead in working days) push successors later but never before their requested start (forward scheduling). Manual tasks keep their start and report violated dependencies. A backward pass gives each task's total float; tasks without float form the critical path.

Editing (with `editable`): drag a bar to move it, its end to resize it, or its link handle onto another bar to link them. Keyboard: Ctrl/Cmd+Left/Right moves the focused task by a working day, Shift+Left/Right changes its duration. The toolbar offers the same actions plus **Link tasks** (then Enter on the successor). Every change is dispatched first as the cancelable `aui-task-change` with the tasks, dependencies, and the new schedule, and is undoable. The engine (`scheduleGantt`, `resourceLoad`, `createsCycle`, `assertGantt`) is pure and runs without DOM.

## 2. Anatomy

```text
<div class="aui-gantt [--editable] [--linking] [--day|--week|--month] [--rtl]">             (consumer host)
  <div class="aui-gantt__toolbar" role="group" aria-label="{label} controls">
    <button class="aui-gantt__tool" data-aui-action="zoomOut|zoomIn|today|earlier|later|shorten|lengthen|link|undo|redo">
  <div class="aui-gantt__body">                                                               (scrolls both ways)
    <div class="aui-gantt__table" role="treegrid" aria-label="{label}" aria-rowcount aria-colcount>   (sticky at inline start)
      <div class="aui-gantt__head-group" role="rowgroup"><div class="aui-gantt__head" role="row"> columnheaders
      <div class="aui-gantt__rows" role="rowgroup">                                           (virtual rows)
        <div class="aui-gantt__row [--summary] [--critical]" role="row" data-aui-task="build"
             aria-rowindex="5" aria-level="1" aria-setsize="4" aria-posinset="2" [aria-expanded] tabindex="0">
          <div class="aui-gantt__cell aui-gantt__cell--name" role="gridcell">
            <span class="aui-gantt__toggle" aria-hidden="true"> <span class="aui-gantt__name">Build</span>
            <span class="aui-gantt__badge aui-gantt__badge--critical">Critical</span>
            <span class="aui-gantt__hidden"> Depends on Design (finish to start).</span>
          <div class="aui-gantt__cell aui-gantt__cell--start" role="gridcell">Oct 5, 2026</div> ...
    <div class="aui-gantt__chart" aria-hidden="true">
      <div class="aui-gantt__scale"><div class="aui-gantt__tier"><span class="aui-gantt__tick">...
      <div class="aui-gantt__canvas">
        <div class="aui-gantt__shade"><div class="aui-gantt__off">                          (non-working days)
        <div class="aui-gantt__today">
        <svg class="aui-gantt__links"><path class="aui-gantt__dependency [--critical] [--violated]">
        <div class="aui-gantt__bars">
          <div class="aui-gantt__bar aui-gantt__bar--c1 [--summary|--milestone|--critical|--manual|--focus]" data-aui-task="build">
            <span class="aui-gantt__fill"><span class="aui-gantt__progress"></span></span>
            <span class="aui-gantt__bar-label">Build</span> <span class="aui-gantt__resize"> <span class="aui-gantt__link-handle">
            <span class="aui-gantt__baseline">
  <div class="aui-gantt__histogram">                                                          (showHistogram)
    <div class="aui-gantt__histogram-title" role="heading" aria-level="3">Resource load</div>
    <div class="aui-gantt__load-row"><div class="aui-gantt__load-label">Ana <span>Peak 150%, 2 days over capacity</span></div>
      <div class="aui-gantt__load-track" aria-hidden="true"><span class="aui-gantt__load [--over]">
  <p class="aui-gantt__instructions">...</p>                                                    (visually hidden)
```

## 3. When to use

- Planning and tracking projects with dependent tasks, milestones, and deadlines.
- Finding the critical path and each task's float after a change.
- Comparing the schedule with a baseline and spotting over-allocated people.

## 4. When not to use

- Meetings and appointments with times of day: use Scheduler.
- Workflow boards without dates: use Kanban.
- A few date ranges in a list: use a table or the Scheduler timeline.

## 5. Public properties

`GanttOptions`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | required | Name of the tree grid. |
| `tasks` | `readonly GanttTask[]` | required | `{ id, parentId, label, start, duration, progress?, manual?, assignments?, baseline?, color?, readOnly?, collapsed? }`. Tasks with children are summaries. |
| `dependencies` | `readonly GanttDependency[]` | `[]` | `{ id, from, to, type? ('FS'), lag? }`; leaf tasks only, no cycles. |
| `resources` | `readonly GanttResource[]` | - | `{ id, label, capacity? (100) }`. |
| `calendar` | `BusinessCalendarDefinition` | Mon-Fri | Working days and holidays. |
| `editable` | `boolean` | `false` | Pointer, keyboard, and toolbar editing. |
| `columns` | `readonly GanttColumnKey[]` | name, start, end, duration | `'name'` first; also `progress`, `resources`, `float`. |
| `showCritical` | `boolean` | `true` | Critical badge, hatched bars, red connectors. |
| `showBaselines` | `boolean` | `true` | Baseline bars and variance text. |
| `showHistogram` | `boolean` | `false` | Resource load histogram. |
| `today` | `PlainDate` | local date | Today line. |
| `canEdit` | `(task) => boolean` | - | Veto edits (summary and read-only tasks are never edited). |
| `scale` | `'day' \| 'week' \| 'month'` | `'week'` | Global. 32, 16, or 5 px per day. |
| `rowHeight` | `number` | `36` | Global. 24..96 px. |
| `historyLimit` | `number` | `50` | Global. |
| `locale`, `direction` | | common | Inherited. |

`task.start` is the **requested** start: auto-scheduled tasks start there or later when dependencies require it. The scheduled dates are in `schedule`.

Controller properties: `host`, `element` (treegrid), `tasks`, `dependencies`, `schedule` (`GanttSchedule`), `businessCalendar`, `scale`, `editable`, `expanded`, `canUndo`, `canRedo`.

## 6. Methods

| Method | Description |
|---|---|
| `Gantt.create(host, options)` | Validate, schedule, and render. |
| `update(options)` | Merge options; new tasks or dependencies clear the history. |
| `setScale(scale)` | Change the scale (keeps the first visible date). |
| `setExpanded(id, expanded)`, `expandAll()`, `collapseAll()` | Summary expansion. |
| `scrollToTask(id, { focus })`, `focusTask(id)`, `scrollToDate(date)` | Navigation. |
| `moveTask(id, start)` | New requested start (next working day). |
| `setDuration(id, duration)` | Working days (0 = milestone). |
| `addDependency(dep)` / `removeDependency(id)` | Links (validated). |
| `resourceLoad(range?)` | Daily load per resource. |
| `undo()` / `redo()` | Snapshot history. |
| `destroy()` | Remove the chart. |
| `scheduleGantt(tasks, deps, calendar)` | Pure scheduling: dates, float, critical, violations, variance. |
| `resourceLoad(tasks, schedule, resources, calendar, range)` | Pure load calculation. |
| `createsCycle(deps, from, to)`, `assertGantt(tasks, deps, resources)` | Validation helpers. |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-task-change` | `GanttTaskChangeDetail { reason; changes; dependency; tasks; dependencies; schedule }` | Cancelable, before the change is applied. `reason`: `move`, `resize`, `link`, `unlink`, `undo`, `redo`. |
| `aui-task-activate` | `GanttTaskActivateDetail { id; task }` | Enter on a row. |
| `aui-expand-change` | `GanttExpandChangeDetail { id; expanded }` | |
| `aui-scale-change` | `GanttScaleChangeDetail { scale }` | |

All events bubble.

## 8. Slots/content areas

None. Rows and bars render task data; use `aui-task-activate` to open details elsewhere.

## 9. CSS parts/hooks

| Class | Part |
|---|---|
| `aui-gantt`, `--editable`, `--linking`, `--day`, `--week`, `--month`, `--rtl` | Host; sizes `--aui-gantt-table-width` (28rem), `--aui-gantt-height` (32rem), `--aui-gantt-tier` (1.5rem) |
| `aui-gantt__toolbar`, `__tool` | Toolbar |
| `aui-gantt__body`, `__table`, `__head-group`, `__head`, `__rows`, `__row[--summary\|--critical\|--link-source]`, `__cell--{key}`, `__toggle`, `__name`, `__badge--{milestone\|critical}` | Tree grid |
| `aui-gantt__chart`, `__scale`, `__tier`, `__tick[--off]`, `__canvas`, `__shade`, `__off`, `__today`, `__links`, `__dependency[--critical\|--violated]` | Timeline |
| `aui-gantt__bars`, `__bar[--c1..--c8\|--summary\|--milestone\|--critical\|--manual\|--editable\|--focus\|--dragging\|--drop\|--no-drop]`, `__fill`, `__progress`, `__bar-label`, `__baseline`, `__resize`, `__link-handle` | Bars |
| `aui-gantt__histogram`, `__histogram-title`, `__load-row`, `__load-label`, `__load-summary`, `__load-track`, `__load[--over]` | Histogram |

## 10. Design tokens

See `metadata/gantt/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8` (bars), `color-error-fg` (critical), `color-warning-fg` (violated links), `color-chart-axis` (connectors), `color-text-muted` (baselines), `color-surface-sunken` (non-working days, headers), `color-primary` (today), `color-selected` (link source).

## 11. States

Row focused; summary expanded or collapsed; critical, milestone, manual, read-only task; violated dependency; baseline; linking; dragging (move, resize, link) over a valid or invalid target; day, week, or month scale; histogram shown.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| row focused | Ctrl/Cmd+Arrow, toolbar Earlier/Later, bar drag | `aui-task-change` (`move`) -> rescheduled; announced |
| row focused | Shift+Arrow, toolbar Shorten/Lengthen, end drag | `aui-task-change` (`resize`) -> rescheduled |
| row focused | toolbar Link | linking (source marked) |
| linking | Enter or click on another task | linked (`link`), or unlinked when the pair is linked, or refused (cycle, summary) |
| linking | Escape, Link again, Enter on the source | cancelled |
| any change | `preventDefault()` on `aui-task-change` | unchanged |
| changed | Ctrl/Cmd+Z / Undo | previous tasks and dependencies (`undo`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Chart | Toolbar, then the grid (one tab stop). |
| ArrowDown / ArrowUp, PageDown / PageUp, Home / End | Row | Move between tasks. |
| ArrowRight / ArrowLeft | Row | Expand / first child; collapse / parent (swapped in RTL). |
| Enter | Row | Activate; while linking, choose the successor. |
| Ctrl/Cmd+ArrowRight / ArrowLeft | Row (editable) | One working day later / earlier. |
| Shift+ArrowRight / ArrowLeft | Row (editable) | Lengthen / shorten by a working day. |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Row (editable) | Undo, redo. |
| Escape | Linking | Cancel. |

## 14. ARIA contract

- The grid is `role="treegrid"` with `aria-rowcount` / `aria-colcount`, named by `label` and described by the instructions; rows carry `aria-rowindex`, `aria-level`, `aria-setsize`, `aria-posinset`, and `aria-expanded` (summaries). Rows are focusable (row focus), one with `tabindex="0"`.
- The timeline, connectors, bars, and histogram tracks are `aria-hidden`; everything they show is text in the grid or histogram labels.
- Toolbar: named group; Link is a toggle (`aria-pressed`); unavailable actions use `aria-disabled`.
- Announcements: new dates after a change, scale, undone, redone (polite); linking instructions, linked, unlinked, refused, not editable, limited by dependencies (assertive).

## 15. Accessibility notes

- Every pointer action has a keyboard and toolbar equivalent (WCAG 2.5.7); shortcuts use modifiers (2.1.4).
- Critical tasks and milestones are labelled with text; dependencies ("Depends on Design (finish to start).") and baseline variance ("2 working days behind baseline.") are visually hidden text read with the row.
- Critical bars use a hatch pattern and a thicker border, not color alone.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

The body has a fixed block size (`--aui-gantt-height`) and scrolls in two dimensions (WCAG 1.4.10 exception) while the page reflows at 320 px. The grid stays at the inline start while the timeline scrolls; in containers narrower than 40rem it scrolls away with the timeline. Headers are sticky. Toolbar buttons meet `touch-target-min`; bars and handles use `touch-action: none`.

## 17. RTL behavior

`direction: 'rtl'` mirrors the timeline (later dates to the left, mirrored connectors) and swaps ArrowLeft / ArrowRight for expand, collapse, moving, and resizing (the arrow toward later dates moves later).

## 18. Theme behavior

Bars are tints of `color-chart-1..8` with solid borders and progress fills; critical bars add a `color-error-fg` border and hatch; manual tasks have dashed borders; summaries are `color-text` brackets; milestones are diamonds; baselines are thin `color-text-muted` bars. Forced colors: Canvas/CanvasText bars, Mark for critical, Highlight for focus and the link source, hatched non-working days.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { gantt: { scale: 'day', rowHeight: 44, historyLimit: 100 } } });
```

Global options: `scale`, `rowHeight`, `historyLimit`, plus inherited `locale` and `direction`.

## 20. Component configuration support

Instance options override global defaults. All options are dynamic through `update()`; `tasks` and `dependencies` clear the undo history; `calendar` reschedules.

## 21. Timezone behavior

Dates are `PlainDate` values without a timezone; durations and lags count working days of the calendar. The default `today` is the device's local date; pass `today` for a fixed date (for example the server's date).

## 22. Icon customization points

Toolbar: `zoom-out`, `zoom-in`, `locate` (today), `chevron-left` / `chevron-right` (earlier / later), `minus` / `plus` (shorten / lengthen), `link`, `undo`, `redo`. Expand: `chevron-right` (`chevron-left` in RTL) / `chevron-down`.

## 23. Security behavior

Text renders through `textContent`. Options are validated (`GANTT_OPTIONS`) before use: unique ids, known parents and resources, no parent cycles, dependencies between leaf tasks, one per pair, and no dependency cycles (the message names the cycle). Positions and sizes are written through the CSSOM; connectors are SVG paths built from numbers (CSP-safe).

## 24. Data handling behavior

No persistence, network access, or telemetry. Changes are reported through `aui-task-change` for the application to save: `tasks` (requested starts and durations), `dependencies`, and `schedule` (computed dates). Store the requested starts; do not write scheduled dates back into `start` (see anti-patterns).

## 25. Performance characteristics

Scheduling is linear in tasks plus dependencies (topological order, forward and backward passes) on a working-day index that maps dates to consecutive integers in constant time. Rows have a fixed height and only the rows in view (plus an overscan and the focused row) are rendered, with their bars and the connectors that touch them. Budgets (e2e): create with 2,000 tasks and 1,500 dependencies < 150 ms; a keyboard move with 2,000 tasks < 60 ms; `scheduleGantt` for 10,000 tasks < 80 ms.

## 26. Supported data scale

Tested with 2,000 tasks in the chart and 10,000 in the engine. Timeline columns are not virtualized: several years on the day scale render long scales (use the week or month scale).

## 27. Usage examples

See section 33 and `metadata/gantt/examples.json`: a plan with dependencies and a milestone, editing with a holiday calendar, baselines and resources with the histogram, the engine without DOM, global configuration.

## 28. Edge cases

- A start on a non-working day moves to the next working day.
- Moving an auto-scheduled task earlier than its dependencies allow keeps it where it is and announces why.
- Manual tasks keep their start; unmet dependencies are dashed connectors and "Dependency not met" text.
- A summary task spans its children, ending on a trailing milestone's date; summaries cannot be edited or linked.
- Linking two tasks that are already linked (either direction) removes the link.
- Negative lags (leads) can start a successor before its predecessor ends.
- Collapsing a summary moves focus from a hidden child to the summary.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `GANTT_OPTIONS` | configuration | Empty label; invalid tasks (ids, labels, dates, durations, progress, colors, baselines, assignments), parent cycles, unknown parents or resources; invalid dependencies (unknown or summary tasks, self links, duplicate pairs, invalid types or lags, cycles); invalid columns or flags; methods called with unknown ids. |
| `BUSINESS_CALENDAR_DEFINITION` | configuration | Invalid `calendar`. |
| `BUSINESS_CALENDAR_NO_WORKING_DAYS` | runtime | The calendar has no working day at all. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Whole working days only (no hours).
- Dependencies between leaf tasks only.
- One constraint type: start no earlier than the requested start.
- Resource load is shown, not leveled.
- Progress is not edited in the chart; pointer drags are announced only when applied.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Adding, deleting, renaming, indenting, or reordering tasks inside the chart.
- Several calendars (per resource or task).
- Printing and export; split, recurring, or cost-tracked tasks.

## 32. TypeScript definitions

```ts
type GanttDependencyType = 'FS' | 'SS' | 'FF' | 'SF';
interface GanttAssignment { resourceId: string; units?: number }
interface GanttBaseline { start: PlainDate; end: PlainDate }
interface GanttTask { id: string; parentId: string | null; label: string; start: PlainDate; duration: number; progress?: number; manual?: boolean; assignments?: readonly GanttAssignment[]; baseline?: GanttBaseline; color?: GanttColor; readOnly?: boolean; collapsed?: boolean }
interface GanttDependency { id: string; from: string; to: string; type?: GanttDependencyType; lag?: number }
interface GanttResource { id: string; label: string; capacity?: number }
interface GanttScheduledTask { id: string; start: PlainDate; end: PlainDate; duration: number; summary: boolean; milestone: boolean; totalFloat: number; critical: boolean; driven: boolean; violations: readonly string[]; variance: number | null }
interface GanttSchedule { tasks: ReadonlyMap<string, GanttScheduledTask>; start: PlainDate | null; finish: PlainDate | null; critical: readonly string[] }
interface GanttResourceLoad { resourceId: string; days: readonly { date: PlainDate; load: number; capacity: number; over: boolean }[]; overDays: number; peak: number }
type GanttScale = 'day' | 'week' | 'month';
type GanttColumnKey = 'name' | 'start' | 'end' | 'duration' | 'progress' | 'resources' | 'float';
interface GanttTaskChange { id: string; start?: PlainDate; duration?: number }
interface GanttTaskChangeDetail { reason: 'move' | 'resize' | 'link' | 'unlink' | 'undo' | 'redo'; changes: GanttTaskChange[]; dependency: GanttDependency | null; tasks: GanttTask[]; dependencies: GanttDependency[]; schedule: GanttSchedule }
```

## 33. Vanilla JS example

```ts
import { plainDate } from '@absoluteui/core';
import { Gantt, type GanttTask, type GanttTaskChangeDetail } from '@absoluteui/components/gantt';
import '@absoluteui/components/gantt/style.css';

let saved: GanttTask[] = [
  { id: 'design', parentId: null, label: 'Design', start: plainDate(2026, 10, 5), duration: 5 },
  { id: 'build', parentId: null, label: 'Build', start: plainDate(2026, 10, 5), duration: 10 },
  { id: 'launch', parentId: null, label: 'Launch', start: plainDate(2026, 10, 5), duration: 0 },
];
const host = document.querySelector<HTMLElement>('#plan');
if (host) {
  Gantt.create(host, {
    label: 'Website relaunch',
    tasks: saved,
    dependencies: [{ id: 'd1', from: 'design', to: 'build' }, { id: 'd2', from: 'build', to: 'launch' }],
    editable: true,
    calendar: { holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }] },
  });
  host.addEventListener('aui-task-change', (event) => {
    saved = (event as CustomEvent<GanttTaskChangeDetail>).detail.tasks;
  });
}
```

## 34. Angular example

`<aui-gantt>` is generated: inputs mirror `GanttOptions`; `[(tasks)]`, `[(dependencies)]`, and `[(scale)]` are two-way; outputs `taskChange`, `taskActivated`, `expandChange`; methods such as `scrollToTask()`, `moveTask()`, `undo()`, `redo()`.

```ts
import { Component } from '@angular/core';
import { plainDate } from '@absoluteui/core';
import type { GanttTask, GanttTaskChangeDetail } from '@absoluteui/components/gantt';
import { AuiGantt } from '@absoluteui/angular/gantt';

@Component({
  selector: 'app-plan',
  imports: [AuiGantt],
  template: `<aui-gantt label="Plan" [tasks]="tasks" [editable]="true" scale="day" (taskChange)="changed($event)"></aui-gantt>`,
})
export class PlanComponent {
  tasks: GanttTask[] = [{ id: 'a', parentId: null, label: 'Kick-off', start: plainDate(2026, 10, 5), duration: 1 }];

  changed(detail: GanttTaskChangeDetail): void {
    this.tasks = detail.tasks;
  }
}
```

## 35. React example

```tsx
import type { GanttDependency, GanttTask } from '@absoluteui/components/gantt';
import { AuiGantt } from '@absoluteui/react/gantt';

export function Plan({ tasks, dependencies, save }: { tasks: GanttTask[]; dependencies: GanttDependency[]; save: (tasks: GanttTask[]) => void }) {
  return (
    <AuiGantt
      label="Plan"
      tasks={tasks}
      dependencies={dependencies}
      editable
      columns={['name', 'start', 'end', 'duration', 'float']}
      onTaskChange={(d) => { save(d.tasks); }}
    />
  );
}
```

Passing the saved `tasks` back through props replaces the data (and clears undo); keep them in a ref or save without re-rendering to keep undo. See [docs/REACT.md](../../../docs/REACT.md).

## 36. Vue example

```vue
<script setup lang="ts">
import { plainDate } from '@absoluteui/core';
import type { GanttTask, GanttTaskChangeDetail } from '@absoluteui/components/gantt';
import { AuiGantt } from '@absoluteui/vue/gantt';

const tasks: GanttTask[] = [{ id: 'a', parentId: null, label: 'Kick-off', start: plainDate(2026, 10, 5), duration: 1 }];
const changed = (detail: GanttTaskChangeDetail) => console.info(detail.reason, detail.schedule.finish);
</script>

<template>
  <AuiGantt label="Plan" :tasks="tasks" editable scale="week" @task-change="changed" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
