# Kanban Board

> Package: `@absoluteui/components/kanban` | Styles: `@absoluteui/components/kanban/style.css` | Since 0.7.0 | Status: R3

## 1. Purpose

A board of columns (workflow states) and optional swimlanes (rows) holding cards. Columns show card counts and work-in-progress (WIP) limits, collapse to a narrow strip, and reorder. Cards move by pointer drag, by keyboard (Space picks a card up, arrow keys move it between positions, columns, and swimlanes, Space drops, Escape cancels), or with a single pointer (toolbar **Move card**, then a click on the target card or cell).

Every move is dispatched first as the cancelable `aui-card-move`, applied immediately, then saved through the optional `moveCard` callback (with an `AbortSignal` and a timeout). A rejected or timed-out save moves the card back, announces the failure, and emits `aui-move-error`. Moves and column reorders are undoable. Cells with many cards render only the cards in view. The model helpers (`moveKanbanCard`, `positionOf`, `cellCards`, `columnCounts`) are pure.

## 2. Anatomy

```text
<div class="aui-kanban [--editable] [--lanes] [--picking]">                                   (consumer host)
  <div class="aui-kanban__toolbar" role="group" aria-label="{label} controls">
    <button class="aui-kanban__tool" data-aui-action="move|undo|redo" [aria-pressed] [aria-disabled]>
  <div class="aui-kanban__board" role="group" aria-label="{label}">                           (scrolls both ways)
    <div class="aui-kanban__row aui-kanban__columns">                                         (sticky header row)
      <div class="aui-kanban__column-header [--collapsed] [--over] [--full] [--held]" data-aui-column="todo">
        <button class="aui-kanban__column-handle" aria-label="Move column To do" aria-pressed="false">
        <span class="aui-kanban__column-title" role="heading" aria-level="3">
          <span class="aui-kanban__column-name">To do</span> <span class="aui-kanban__count">2 of 3</span> <span class="aui-kanban__over">Over limit</span>
        <button class="aui-kanban__column-toggle" aria-label="Cards in To do" aria-expanded="true">
    <div class="aui-kanban__lanes">
      <section class="aui-kanban__lane [--collapsed]" data-aui-lane="web" aria-labelledby="...">   (a <div> without swimlanes)
        <div class="aui-kanban__lane-header" role="heading" aria-level="3"><button class="aui-kanban__lane-toggle" aria-expanded="true">
        <div class="aui-kanban__row aui-kanban__cells">
          <div class="aui-kanban__cell [--collapsed] [--drop] [--no-drop]" data-aui-column="todo" data-aui-lane="web">
            <ul class="aui-kanban__list [--virtual]" role="list" aria-label="To do, Web">
              <li class="aui-kanban__card aui-kanban__card--c3 [--held] [--picked] [--locked]" data-aui-card="a"
                  tabindex="0" aria-posinset="1" aria-setsize="2" aria-describedby="{instructions}" [aria-busy]>
                <span class="aui-kanban__grip" aria-hidden="true">
                <div class="aui-kanban__card-body"> title, description, tags </div>
                <span class="aui-kanban__state">, Saving</span>
            <div class="aui-kanban__empty">No cards</div> <div class="aui-kanban__summary">3 cards</div>
  <p class="aui-kanban__instructions" id="...">...</p>                                            (visually hidden)
```

## 3. When to use

- Tracking work through workflow states with limits on work in progress.
- Splitting a board by team, priority, or product with swimlanes.
- Letting users re-prioritize and move items by pointer or keyboard, saved to a server.

## 4. When not to use

- Tabular data with many attributes per item: use Data Table.
- Items scheduled on dates: use Scheduler or Gantt.
- Reordering one list: use Sortable List.

## 5. Public properties

`KanbanOptions`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | required | Name of the board; the toolbar is "{label} controls". |
| `columns` | `readonly KanbanColumn[]` | required | `{ id, label, wipLimit?, collapsed?, locked? }`, at least one. |
| `lanes` | `readonly KanbanLane[]` | - | `{ id, label, collapsed? }`; every card then needs `laneId`. |
| `cards` | `readonly KanbanCard[]` | required | `{ id, columnId, laneId?, title, description?, tags?, color? (1..8), locked? }`. Array order is the order within a cell. |
| `editable` | `boolean` | `true` | Moving cards and columns. |
| `columnReorder` | `boolean` | `true` | Column handles (when editable). |
| `renderCard` | `(card, { column, lane, doc }) => Node` | title, description, tags | Non-interactive content. Released with `releaseNode()` when replaced or removed (since 0.9.0). |
| `canMove` | `(card, to) => boolean` | - | Veto moves. |
| `moveCard` | `(move, signal) => Promise<void> \| void` | - | Save a move; a rejection rolls it back. |
| `wipPolicy` | `'warn' \| 'block'` | `'warn'` | Global. `block` refuses moves into full columns. |
| `virtualThreshold` | `number` | `150` | Global. Cells with more cards render only the cards in view. |
| `requestTimeoutMs` | `number` | `30000` | Global. `moveCard` timeout. |
| `historyLimit` | `number` | `50` | Global. Undo depth (0..500). |
| `headingLevel` | `number` | `3` | Global. Heading level of columns and swimlanes. |
| `locale`, `direction` | | common | Inherited. |

Controller properties: `host`, `element` (the board), `cards`, `columns` (current order and collapse), `editable`, `canUndo`, `canRedo`, `pending` (cards being saved).

## 6. Methods

| Method | Description |
|---|---|
| `Kanban.create(host, options)` | Validate and render (replaces the host's children). |
| `update(options)` | Merge options; new `cards` or `columns` clear the undo history; new `cards` abort pending saves. |
| `positionOf(id)` | `{ columnId, laneId, index }` or null. |
| `moveCard(id, { columnId, laneId, index? })` | Move like a user would (checks, event, save, history); false when refused. |
| `moveColumn(id, index)` | Reorder columns (undoable). |
| `setCollapsed('column' \| 'lane', id, collapsed)` | Collapse or expand. |
| `focusCard(id)` | Focus a card (expands and scrolls to it). |
| `undo()` / `redo()` | History of moves and column reorders; refused while saves are pending. |
| `destroy()` | Abort saves and remove the board. |
| `moveKanbanCard(cards, id, to)`, `positionOf(cards, id, lanes)`, `cellCards(cards, columnId, laneId)`, `columnCounts(cards)` | Pure helpers. |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-card-activate` | `KanbanCardActivateDetail { id; card }` | Enter, or a click outside a single-pointer move. |
| `aui-card-move` | `KanbanCardMoveDetail { reason; id; card; from; to; cards }` | Cancelable, before the move is applied. |
| `aui-move-error` | `KanbanMoveErrorDetail { id; reason; error }` | `moveCard` failed; the card is back. |
| `aui-column-move` | `KanbanColumnMoveDetail { reason; id; from; to; order }` | Cancelable. |
| `aui-collapse-change` | `KanbanCollapseChangeDetail { kind; id; collapsed }` | |

All events bubble.

## 8. Slots/content areas

`renderCard` returns each card's content (rebuilt when the card's data changes). Keep it non-interactive: the card is the focusable item and its text is what screen readers read. Custom content should contain the title text.

## 9. CSS parts/hooks

| Class | Part |
|---|---|
| `aui-kanban`, `--editable`, `--lanes`, `--picking` | Host; sizes `--aui-kanban-column-width` (17rem), `--aui-kanban-collapsed-width` (3rem), `--aui-kanban-list-height` (36rem) |
| `aui-kanban__toolbar`, `__tool`, `__tool-text` | Toolbar |
| `aui-kanban__board`, `__row`, `__columns`, `__column-header[--collapsed\|--over\|--full\|--held]`, `__column-handle`, `__column-title`, `__column-name`, `__count`, `__over`, `__column-toggle` | Board and columns |
| `aui-kanban__lanes`, `__lane[--collapsed]`, `__lane-header`, `__lane-toggle`, `__lane-name`, `__cells` | Swimlanes |
| `aui-kanban__cell[--collapsed\|--locked\|--drop\|--no-drop]`, `__list[--virtual]`, `__spacer`, `__empty`, `__summary` | Cells |
| `aui-kanban__card[--c1..--c8\|--accent\|--held\|--dragging\|--picked\|--locked]`, `__grip`, `__card-body`, `__title`, `__description`, `__tags`, `__tag`, `__state` | Cards |

## 10. Design tokens

See `metadata/kanban/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `shadow-sm` (cards), `color-chart-1..8` (accent stripes), `color-selected` / `color-selected-text` (picked cards), `color-warning-fg` (over limit), `color-focus-ring` / `color-error-fg` (drop targets), `color-surface-sunken` (board), `color-bg` (cells).

## 11. States

Card focused, picked up (keyboard), dragged (pointer), picked for a single-pointer move, saving (`aria-busy`), locked; column at or over its limit, collapsed, picked up; swimlane collapsed; valid or invalid drop target; empty cell; virtual cell; read-only board.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| card focused | Space | picked up (announced with its position) |
| picked up | arrow keys, Home, End | moved in the preview (each step announced) |
| picked up | Space, Enter | `aui-card-move` -> applied (announced) -> saving (when `moveCard` is set) |
| picked up | Escape, Tab | cancelled, back in place |
| saving | `moveCard` resolves | saved |
| saving | `moveCard` rejects or times out | moved back, removed from history, `aui-move-error` |
| card focused | toolbar Move | picked; a click on a card or cell moves it there; Escape or Move cancels |
| column header | Space on the handle, arrows, Space | reordered (`aui-column-move`) |
| any | Ctrl/Cmd+Z / Undo | previous state (saved with `reason: 'undo'`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Board | Toolbar, column handles and toggles, swimlane toggles, then the cards (one tab stop). |
| ArrowDown / ArrowUp | Card | Next / previous card; past the end, into the next / previous swimlane. |
| ArrowRight / ArrowLeft | Card | Same position in the next / previous non-empty column (swapped in RTL). |
| Home / End (Ctrl+Home / Ctrl+End) | Card | First / last card of the cell (of the board). |
| Enter | Card | Activate. |
| Space | Card (editable) | Pick up. |
| Arrow keys, Home, End | Picked-up card | Move between positions, columns (skipping columns that refuse it), and swimlanes. |
| Space / Enter | Picked-up card | Drop. |
| Escape / Tab | Picked-up card | Cancel. |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Card (editable) | Undo, redo. |
| Space or Enter, ArrowLeft / ArrowRight, Home / End, Escape | Column handle | Pick up, move, drop, cancel a column. |

## 14. ARIA contract

- The board is a named `role="group"`; columns and swimlanes have headings (`aria-level` = `headingLevel`); swimlanes are `<section>` elements labelled by their heading.
- Each cell is a named `role="list"`; cards are focusable list items with `aria-posinset` / `aria-setsize` (the full cell size in virtual cells) and `aria-describedby` pointing at the instructions.
- One card has `tabindex="0"` (roving).
- Toggles use `aria-expanded`; the Move button and column handles use `aria-pressed`; unavailable toolbar buttons use `aria-disabled` and stay focusable.
- Announcements (assertive): picked up, each keyboard step, dropped, cancelled, refused, save failed. Polite: undone, redone.

## 15. Accessibility notes

- Moving cards never requires dragging (WCAG 2.5.7): keyboard grab-and-move, or select a card, press **Move card**, and click the target.
- WIP state, locked cards, and saving cards are text ("3 of 5", "Over limit", ", Locked", ", Saving"), not color alone; the accent stripe is decorative.
- Escape while a card is picked up cancels the move and does not close an enclosing dialog.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

The board scrolls in both directions inside its container (a two-dimensional layout; WCAG 1.4.10 exception) while the page reflows at 320 px. The column header row is sticky. Set column widths with `--aui-kanban-column-width`. On touch devices drags start from the card grip; touching elsewhere scrolls. Toolbar and column buttons meet `touch-target-min`.

## 17. RTL behavior

With `direction: 'rtl'` ArrowLeft and ArrowRight swap roles for moving between columns (for cards and column reordering). The layout follows the document direction; collapse chevrons are mirrored.

## 18. Theme behavior

Cards use `color-surface`, `color-border`, `radius-md`, `shadow-sm`, and an accent stripe from `color-chart-1..8`. Picked cards use `color-selected` with `color-selected-text`. Over-limit columns get a `color-warning-fg` top border, icon, and "Over limit" text. Drop targets use dashed `color-focus-ring` (valid) or `color-error-fg` (invalid) borders. Forced colors: CanvasText borders, Highlight for picked cards and valid targets, Mark for invalid targets and over-limit columns.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { kanban: { wipPolicy: 'block', headingLevel: 2, virtualThreshold: 200 } } });
```

Global options: `wipPolicy`, `virtualThreshold`, `requestTimeoutMs`, `historyLimit`, `headingLevel`, plus inherited `locale` and `direction`. Changes apply to existing boards immediately.

## 20. Component configuration support

Instance options override global defaults. All options are dynamic through `update()`; `cards` and `columns` replace the data and clear the undo history.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`grip` (Move card, card grip, column handle), `undo`, `redo`, `alert-triangle` (over limit), `chevron-down` / `chevron-right` (`chevron-left` in RTL) for collapse toggles.

## 23. Security behavior

Titles, descriptions, tags, and labels render through `textContent`; `renderCard` content is DOM owned by the application. Options are validated before use. Drag offsets and virtual spacers are written through the CSSOM only (CSP-safe). `moveCard` receives an `AbortSignal` and times out.

## 24. Data handling behavior

No persistence, network access, or telemetry of its own. Moves are reported through `aui-card-move` (with every card after the move) and saved by the application's `moveCard`; `cards` and `columns` getters return the current state.

## 25. Performance characteristics

Cards and cells are rendered once and reused by id; a re-render moves only elements that are out of place. A move re-renders the board from the model. Cells above `virtualThreshold` render the cards in view plus an overscan, with spacers sized from measured card heights (and scroll anchoring on the focused card). Budgets (e2e): create with 8 columns and 1,000 cards < 120 ms; a keyboard move with 1,000 cards < 40 ms; create with one virtual cell of 5,000 cards < 80 ms.

## 26. Supported data scale

Tested with 1,000 cards over 8 columns and 5,000 cards in one virtual cell. Columns and swimlanes are not virtualized (tens of columns and swimlanes).

## 27. Usage examples

See section 33 and `metadata/kanban/examples.json`: a basic board with limits, server saves with rollback, swimlanes with vetoes, custom cards, the pure model, global configuration.

## 28. Edge cases

- Moving within a full column is always allowed under `wipPolicy: 'block'`; moving into it is refused (keyboard moves skip to the next column that accepts the card).
- Locked columns accept no cards and release none; locked cards cannot be picked up.
- A card whose save is pending cannot be moved; undo waits for all saves.
- Dropping a card where it started is not a move (no event).
- A card in a collapsed column or swimlane is not focusable; `focusCard` expands them.
- Replacing `cards` while saves are pending aborts them (no rollback).
- Cards whose content changes are re-rendered; unchanged cards keep their DOM.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `KANBAN_OPTIONS` | configuration | Empty label; no columns; duplicate ids; cards in unknown columns or swimlanes (or without `laneId` on a board with swimlanes); invalid limits, colors, tags, flags, or callbacks; `moveCard`, `moveColumn`, `setCollapsed`, `focusCard` with unknown ids or invalid targets. |

A failed construction leaves the host untouched. Save failures are events (`aui-move-error`), not exceptions.

## 30. Known limitations

- Only cards in a cell are virtualized.
- WIP limits count a column across all swimlanes.
- A failed save drops that move from the undo history.
- Pointer drags are announced at pick-up and drop only.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Adding, editing, or deleting cards and columns inside the board.
- Moving several cards at once.
- Nested swimlanes; cards spanning columns.

## 32. TypeScript definitions

```ts
interface KanbanColumn { id: string; label: string; wipLimit?: number; collapsed?: boolean; locked?: boolean }
interface KanbanLane { id: string; label: string; collapsed?: boolean }
type KanbanCardColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
interface KanbanCard { id: string; columnId: string; laneId?: string; title: string; description?: string; tags?: readonly string[]; color?: KanbanCardColor; locked?: boolean }
interface KanbanPosition { columnId: string; laneId: string | null; index: number }
type KanbanTarget = Omit<KanbanPosition, 'index'> & { index?: number };
type KanbanWipPolicy = 'warn' | 'block';
type KanbanMoveReason = 'move' | 'undo' | 'redo';
interface KanbanRenderContext { column: KanbanColumn; lane: KanbanLane | null; doc: Document }
interface KanbanCardMoveDetail { reason: KanbanMoveReason; id: string; card: KanbanCard; from: KanbanPosition; to: KanbanPosition; cards: KanbanCard[] }
interface KanbanCardActivateDetail { id: string; card: KanbanCard }
interface KanbanMoveErrorDetail { id: string; reason: KanbanMoveReason; error: unknown }
interface KanbanColumnMoveDetail { reason: KanbanMoveReason; id: string; from: number; to: number; order: string[] }
interface KanbanCollapseChangeDetail { kind: 'column' | 'lane'; id: string; collapsed: boolean }
```

## 33. Vanilla JS example

```ts
import { Kanban, type KanbanCard, type KanbanCardMoveDetail } from '@absoluteui/components/kanban';
import '@absoluteui/components/kanban/style.css';

let saved: KanbanCard[] = [
  { id: 'a', columnId: 'todo', title: 'Write the spec', tags: ['docs'] },
  { id: 'b', columnId: 'doing', title: 'Fix login', color: 2 },
];
const host = document.querySelector<HTMLElement>('#board');
if (host) {
  Kanban.create(host, {
    label: 'Sprint 12',
    columns: [{ id: 'todo', label: 'To do' }, { id: 'doing', label: 'In progress', wipLimit: 3 }, { id: 'done', label: 'Done' }],
    cards: saved,
  });
  host.addEventListener('aui-card-move', (event) => {
    saved = (event as CustomEvent<KanbanCardMoveDetail>).detail.cards;
  });
}
```

## 34. Angular example

`<aui-kanban>` is generated: inputs mirror `KanbanOptions`; `[(cards)]` is two-way; outputs `cardActivated`, `cardMoved`, `moveError`, `columnMoved`, `collapseChange`; methods such as `moveCard()`, `focusCard()`, `undo()`, `redo()`.

```ts
import { Component } from '@angular/core';
import type { KanbanCard, KanbanCardMoveDetail, KanbanColumn } from '@absoluteui/components/kanban';
import { AuiKanban } from '@absoluteui/angular/kanban';

@Component({
  selector: 'app-board',
  imports: [AuiKanban],
  template: `<aui-kanban label="Sprint" [columns]="columns" [cards]="cards" wipPolicy="block" (cardMoved)="moved($event)"></aui-kanban>`,
})
export class BoardComponent {
  columns: KanbanColumn[] = [{ id: 'todo', label: 'To do' }, { id: 'done', label: 'Done' }];
  cards: KanbanCard[] = [{ id: 'a', columnId: 'todo', title: 'Write the spec' }];

  moved(detail: KanbanCardMoveDetail): void {
    // send detail.id and detail.to to the server
    void detail;
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
