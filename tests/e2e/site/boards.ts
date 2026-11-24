// R3 phase 3b boards page (Kanban, Gantt), bundled against the built packages.
// ?edit=0 read-only; ?dir=rtl; ?theme=…; ?fail=1 makes Kanban saves fail; ?lanes=0 no swimlanes;
// ?scale=day|week|month; ?histogram=1 shows the resource histogram.
import { configureAbsoluteUI, plainDate } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Kanban, type KanbanCard, type KanbanColumn, type KanbanLane } from '@absoluteui/components/kanban';
import { Gantt, scheduleGantt, type GanttDependency, type GanttScale, type GanttTask } from '@absoluteui/components/gantt';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', locale: 'en-GB', direction });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
const editable = params.get('edit') !== '0';
const fail = params.get('fail') === '1';

// ---- Kanban ----------------------------------------------------------------------------

const columns: KanbanColumn[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress', wipLimit: 2 },
  { id: 'review', label: 'Review', wipLimit: 3 },
  { id: 'done', label: 'Done', locked: true },
];
const lanes: KanbanLane[] = [
  { id: 'web', label: 'Web' },
  { id: 'app', label: 'Mobile app' },
];
const withLanes = params.get('lanes') !== '0';
const laneCards: KanbanCard[] = [
  { id: 'k1', columnId: 'todo', laneId: 'web', title: 'New header', tags: ['design'], color: 1 },
  { id: 'k2', columnId: 'todo', laneId: 'web', title: 'Cookie banner', description: 'Legal review needed', color: 4 },
  { id: 'k3', columnId: 'doing', laneId: 'web', title: 'Search page', color: 2 },
  { id: 'k4', columnId: 'doing', laneId: 'app', title: 'Push notifications', tags: ['backend', 'ios'], color: 3 },
  { id: 'k5', columnId: 'doing', laneId: 'app', title: 'Offline mode', color: 5 },
  { id: 'k6', columnId: 'review', laneId: 'app', title: 'Dark theme', locked: true, color: 6 },
  { id: 'k7', columnId: 'done', laneId: 'web', title: 'Release 1.0', color: 7 },
];
// Without swimlanes the cards drop their laneId.
const cards: KanbanCard[] = withLanes ? laneCards : laneCards.map((c) => {
  const copy = { ...c };
  delete copy.laneId;
  return copy;
});
const lastBoard = byId('last-board');
const kanbanHost = byId('kanban');
const kanban = Kanban.create(kanbanHost, {
  label: 'Sprint 12',
  columns,
  ...(withLanes ? { lanes } : {}),
  cards,
  editable,
  moveCard: (_move, signal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      if (fail) reject(new Error('Board service unavailable'));
      else resolve();
      // A failing save takes longer, so tests can observe the optimistic move before the rollback.
    }, fail ? 400 : 30);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    }, { once: true });
  }),
});
for (const type of ['aui-card-activate', 'aui-card-move', 'aui-move-error', 'aui-column-move', 'aui-collapse-change']) {
  kanbanHost.addEventListener(type, (e) => {
    const d = (e as CustomEvent<Record<string, unknown>>).detail;
    const to = typeof d.to === 'object' && d.to !== null ? (d.to as { columnId?: string }).columnId ?? '' : '';
    lastBoard.textContent = `${type.replace('aui-', '')} ${typeof d.id === 'string' ? d.id : ''} ${to}`.replace(/\s+/g, ' ').trim();
  });
}

// ---- Gantt -------------------------------------------------------------------------------

const d = (m: number, day: number) => plainDate(2026, m, day);
const tasks: GanttTask[] = [
  { id: 'p1', parentId: null, label: 'Discovery', start: d(9, 28), duration: 0 },
  { id: 't1', parentId: 'p1', label: 'Interviews', start: d(9, 28), duration: 4, progress: 100, assignments: [{ resourceId: 'ana' }], baseline: { start: d(9, 28), end: d(10, 1) } },
  { id: 't2', parentId: 'p1', label: 'Requirements', start: d(9, 28), duration: 3, progress: 40, assignments: [{ resourceId: 'ana', units: 50 }, { resourceId: 'ben' }], baseline: { start: d(10, 1), end: d(10, 5) } },
  { id: 'm1', parentId: 'p1', label: 'Sign-off', start: d(9, 28), duration: 0 },
  { id: 'p2', parentId: null, label: 'Delivery', start: d(9, 28), duration: 0 },
  { id: 't3', parentId: 'p2', label: 'Design', start: d(9, 28), duration: 5, assignments: [{ resourceId: 'cy' }], color: 3 },
  { id: 't4', parentId: 'p2', label: 'Build', start: d(9, 28), duration: 8, progress: 10, assignments: [{ resourceId: 'ben' }, { resourceId: 'cy', units: 50 }], color: 2 },
  { id: 't5', parentId: 'p2', label: 'Documentation', start: d(10, 12), duration: 3, assignments: [{ resourceId: 'ana' }], color: 5 },
  { id: 't6', parentId: 'p2', label: 'Vendor audit', start: d(10, 7), duration: 2, manual: true, readOnly: true, color: 6 },
  { id: 'm2', parentId: null, label: 'Launch', start: d(9, 28), duration: 0 },
];
const dependencies: GanttDependency[] = [
  { id: 'd1', from: 't1', to: 't2', type: 'SS', lag: 1 },
  { id: 'd2', from: 't2', to: 'm1' },
  { id: 'd3', from: 'm1', to: 't3' },
  { id: 'd4', from: 't3', to: 't4', type: 'SS', lag: 2 },
  { id: 'd5', from: 't4', to: 'm2' },
  { id: 'd6', from: 't4', to: 't6' },
  { id: 'd7', from: 't3', to: 't5', type: 'FF' },
];
const scaleParam = params.get('scale');
const lastPlan = byId('last-plan');
const ganttHost = byId('gantt');
const gantt = Gantt.create(ganttHost, {
  label: 'Website relaunch',
  tasks,
  dependencies,
  resources: [{ id: 'ana', label: 'Ana Silva' }, { id: 'ben', label: 'Ben Okafor', capacity: 100 }, { id: 'cy', label: 'Cy Tan', capacity: 80 }],
  calendar: { holidays: [{ date: d(10, 9), name: 'Founders day' }] },
  editable,
  today: d(10, 1),
  scale: (['day', 'week', 'month'].includes(scaleParam ?? '') ? scaleParam : 'day') as GanttScale,
  columns: ['name', 'start', 'end', 'duration', 'progress'],
  showHistogram: params.get('histogram') === '1',
});
for (const type of ['aui-task-change', 'aui-task-activate', 'aui-expand-change', 'aui-scale-change']) {
  ganttHost.addEventListener(type, (e) => {
    const detail = (e as CustomEvent<Record<string, unknown>>).detail;
    lastPlan.textContent = `${type.replace('aui-', '')} ${typeof detail.reason === 'string' ? detail.reason : ''} ${typeof detail.id === 'string' ? detail.id : ''}`.replace(/\s+/g, ' ').trim();
  });
}

Object.assign(window, { __auiReady: true, __aui: { Kanban, Gantt, scheduleGantt, createBusinessCalendar, kanban, gantt } });
