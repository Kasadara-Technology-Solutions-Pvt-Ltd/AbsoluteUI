// Gantt showcase: a project plan on a business calendar with summary tasks, dependencies, the
// critical path, baselines, resource load, editing by drag or keyboard with undo, and scales.
import { plainDate, type PlainDate } from '@absoluteui/core';
import { Gantt, type GanttTask, type GanttTaskChangeDetail } from '@absoluteui/components/gantt';
import { action, choice, createShowcase, hostIn, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Project plan',
  description: 'Drag bars or use the keyboard to move tasks; dependent tasks follow on working days. Toggle the critical path, baselines, and resource load.',
});

const d = (m: number, day: number): PlainDate => plainDate(2026, m, day);
const tasks: GanttTask[] = [
  { id: 'p1', parentId: null, label: 'Discovery', start: d(11, 2), duration: 0 },
  { id: 'research', parentId: 'p1', label: 'User research', start: d(11, 2), duration: 5, progress: 100, assignments: [{ resourceId: 'ada' }], baseline: { start: d(11, 2), end: d(11, 6) } },
  { id: 'reqs', parentId: 'p1', label: 'Requirements', start: d(11, 9), duration: 3, progress: 60, assignments: [{ resourceId: 'chen' }], baseline: { start: d(11, 9), end: d(11, 10) } },
  { id: 'p2', parentId: null, label: 'Build', start: d(11, 12), duration: 0 },
  { id: 'design', parentId: 'p2', label: 'Design', start: d(11, 12), duration: 4, progress: 30, assignments: [{ resourceId: 'grace' }] },
  { id: 'api', parentId: 'p2', label: 'API', start: d(11, 16), duration: 8, assignments: [{ resourceId: 'chen' }, { resourceId: 'divya', units: 50 }] },
  { id: 'ui', parentId: 'p2', label: 'Interface', start: d(11, 16), duration: 6, assignments: [{ resourceId: 'divya' }] },
  { id: 'qa', parentId: 'p2', label: 'Testing', start: d(11, 26), duration: 5, assignments: [{ resourceId: 'grace' }] },
  { id: 'launch', parentId: null, label: 'Launch', start: d(12, 3), duration: 0 },
];
let saved = tasks;

const host = hostIn(sc.stage);
const gantt = Gantt.create(host, {
  label: 'Portal project',
  tasks,
  dependencies: [
    { id: 'd1', from: 'research', to: 'reqs' },
    { id: 'd2', from: 'reqs', to: 'design' },
    { id: 'd3', from: 'design', to: 'api' },
    { id: 'd4', from: 'design', to: 'ui' },
    { id: 'd5', from: 'api', to: 'qa' },
    { id: 'd6', from: 'ui', to: 'qa' },
    { id: 'd7', from: 'qa', to: 'launch' },
  ],
  resources: [
    { id: 'ada', label: 'Ada' },
    { id: 'chen', label: 'Chen' },
    { id: 'divya', label: 'Divya' },
    { id: 'grace', label: 'Grace' },
  ],
  calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [{ date: d(11, 26), name: 'Company day' }] },
  editable: true,
  showCritical: true,
  scale: 'week',
  today: d(11, 22),
});
host.addEventListener('aui-task-change', (e) => {
  saved = (e as CustomEvent<GanttTaskChangeDetail>).detail.tasks;
  sc.log('plan changed', { tasks: saved.length });
});
sc.listen(host, ['aui-task-activate', 'aui-expand-change', 'aui-scale-change'], 'gantt');

choice(
  sc,
  'Scale',
  [
    { value: 'day', label: 'Days' },
    { value: 'week', label: 'Weeks' },
    { value: 'month', label: 'Months' },
  ],
  'week',
  (scale) => {
    gantt.setScale(scale);
  },
);
toggle(sc, 'Critical path', true, (showCritical) => {
  gantt.update({ showCritical });
});
toggle(sc, 'Baselines', false, (showBaselines) => {
  gantt.update({ showBaselines });
});
toggle(sc, 'Resource load', false, (showHistogram) => {
  gantt.update({ showHistogram });
});
toggle(sc, 'Editable', true, (editable) => {
  gantt.update({ editable });
});
action(sc, 'Undo', () => {
  gantt.undo();
});
