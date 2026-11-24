---
title: Server data
description: Connect tables, pivots, boards, schedulers, organization charts, and uploads to your server with cancellation, timeouts, and rollback.
---

AbsoluteUI never talks to a server by itself. Components that need remote data take **functions you provide** and call them with an `AbortSignal`. The library handles the hard parts around them: cancelling stale requests, timing out, validating responses, showing loading states, and rolling back optimistic changes when a save fails.

## The contract

| Component | You provide | Called when |
|---|---|---|
| [Data Table](/docs/components/data-table/) (`mode: 'server'`) | Rows and `total` through `update()` | You listen for `aui-sort-change`, `aui-filter-change`, and `aui-page-change`, then read `getState()` |
| [Pivot Grid](/docs/components/pivot-grid/) | `dataSource: { query(query, signal), members(request, signal) }` | Layout changes and group expansion (lazy) |
| [Scheduler](/docs/components/scheduler/) | `loadEvents(range, signal)` | The visible range changes (loaded ranges are cached in memory) |
| [Kanban](/docs/components/kanban/) | `moveCard(move, signal)` | A card was moved; a failure moves it back |
| [Organization Chart](/docs/components/org-chart/) | `loadChildren(node, signal)` | A lazy team is expanded |
| [Upload Queue](/docs/components/upload-queue/) | `upload(file, { signal, onProgress, attempt, id })` | Each file, with concurrency, cancel, and retry |

Rules that apply to all of them:

- **Honour the signal.** Pass it to `fetch()`. The component aborts requests it no longer needs (the user paged again, collapsed a group, or destroyed the component).
- **Timeouts.** Pivot Grid, Scheduler, Kanban, and Organization Chart have a `requestTimeoutMs` option (default 30 seconds); a request that takes longer is aborted and reported as an error. Upload Queue retries failed uploads (`retries`, `retryDelay`).
- **Validation.** Pivot Grid, Scheduler, and Organization Chart check answers before using them; malformed data raises a documented error instead of rendering garbage.
- **Failures are handled visibly.** A Kanban move is applied at once and then saved through `moveCard`; a rejection or timeout moves the card back, removes the move from the history, and announces the failure. Scheduler edits are dispatched as the cancelable `aui-event-change`: cancel it to veto, or call `undo()` if your save fails. A failed lazy load keeps the org chart node collapsed and announces it.

## Data Table in server mode

```ts
import { DataTable, type DataTableColumn, type DataTableState } from '@absoluteui/components/data-table';

interface Employee {
  id: string;
  name: string;
  department: string;
}

const columns: DataTableColumn<Employee>[] = [
  { id: 'name', header: 'Name', accessor: (e) => e.name, filter: 'text' },
  { id: 'department', header: 'Department', accessor: (e) => e.department },
];
const host = document.querySelector<HTMLElement>('#employees');
if (host) {
  const table = DataTable.create<Employee>(host, { caption: 'Employees', mode: 'server', total: 0, rows: [], loading: true, rowId: (e) => e.id, columns });
  let controller: AbortController | null = null;
  const load = async (state: DataTableState): Promise<void> => {
    controller?.abort();
    controller = new AbortController();
    table.update({ loading: true });
    const response = await fetch('/api/employees/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort: state.sort, filters: state.filters, page: state.page, pageSize: state.pageSize }),
      signal: controller.signal,
    });
    const body = (await response.json()) as { rows: Employee[]; total: number };
    table.update({ rows: body.rows, total: body.total, loading: false });
  };
  for (const type of ['aui-sort-change', 'aui-filter-change', 'aui-page-change']) {
    host.addEventListener(type, () => {
      load(table.getState()).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) table.update({ loading: false });
      });
    });
  }
  void load(table.getState());
}
```

Validate and authorize every query on the server: sort keys, filter values, and page sizes come from the browser.

## Saving state

Data Table views (`getState()` and `setState()`), Pivot layouts, and Dashboard layouts can be serialized and restored. Components never store them; where you keep them is your choice.
