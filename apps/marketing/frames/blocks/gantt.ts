import { Gantt, type GanttDependency, type GanttTask } from '@absoluteui/components/gantt';
import { plainDate } from '@absoluteui/core';

// Durations count business days: weekends and holidays are skipped when scheduling.
const calendar = { holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }] };

const start = plainDate(2026, 11, 2);
const tasks: GanttTask[] = [
  { id: 'plan', parentId: null, label: 'Planning', start, duration: 0 },
  { id: 'research', parentId: 'plan', label: 'User research', start, duration: 5, progress: 100 },
  { id: 'spec', parentId: 'plan', label: 'Specification', start, duration: 4, progress: 60 },
  { id: 'build', parentId: null, label: 'Build', start, duration: 0 },
  { id: 'ui', parentId: 'build', label: 'User interface', start, duration: 10, progress: 20 },
  { id: 'api', parentId: 'build', label: 'Server API', start, duration: 8 },
  { id: 'test', parentId: null, label: 'Testing', start, duration: 6 },
  { id: 'launch', parentId: null, label: 'Launch', start, duration: 0 },
];
const dependencies: GanttDependency[] = [
  { id: 'd1', from: 'research', to: 'spec' },
  { id: 'd2', from: 'spec', to: 'ui' },
  { id: 'd3', from: 'spec', to: 'api' },
  { id: 'd4', from: 'ui', to: 'test' },
  { id: 'd5', from: 'api', to: 'test' },
  { id: 'd6', from: 'test', to: 'launch', lag: 1 },
];

const host = document.getElementById('plan');
if (host) {
  Gantt.create(host, {
    label: 'Product launch',
    tasks,
    dependencies,
    calendar,
    editable: true,
    showCritical: true,
    columns: ['name', 'start', 'end', 'duration', 'progress'],
  });
}
