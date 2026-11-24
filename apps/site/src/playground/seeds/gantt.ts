import { plainDate, type PlainDate } from '@absoluteui/core';
import { Gantt, type GanttOptions } from '@absoluteui/components/gantt';
import { host, seed } from '../seed.js';

const d = (month: number, day: number): PlainDate => plainDate(2026, month, day);

export default seed<GanttOptions>({
  options: {
    label: 'Onboarding portal project',
    tasks: [
      { id: 'p1', parentId: null, label: 'Discovery', start: d(11, 2), duration: 0 },
      { id: 'research', parentId: 'p1', label: 'User research', start: d(11, 2), duration: 5, progress: 100, assignments: [{ resourceId: 'ada' }] },
      { id: 'reqs', parentId: 'p1', label: 'Requirements', start: d(11, 9), duration: 3, progress: 60, assignments: [{ resourceId: 'chen' }] },
      { id: 'p2', parentId: null, label: 'Build', start: d(11, 12), duration: 0 },
      { id: 'design', parentId: 'p2', label: 'Design', start: d(11, 12), duration: 4, progress: 30, assignments: [{ resourceId: 'grace' }] },
      { id: 'build', parentId: 'p2', label: 'Implementation', start: d(11, 18), duration: 8, assignments: [{ resourceId: 'chen' }, { resourceId: 'ada', units: 50 }] },
      { id: 'launch', parentId: null, label: 'Launch', start: d(12, 2), duration: 0 },
    ],
    dependencies: [
      { id: 'd1', from: 'research', to: 'reqs' },
      { id: 'd2', from: 'reqs', to: 'design' },
      { id: 'd3', from: 'design', to: 'build' },
      { id: 'd4', from: 'build', to: 'launch' },
    ],
    resources: [
      { id: 'ada', label: 'Ada' },
      { id: 'chen', label: 'Chen' },
      { id: 'grace', label: 'Grace' },
    ],
    calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [{ date: d(11, 26), name: 'Company day' }] },
    editable: true,
    showCritical: true,
    scale: 'week',
    today: d(11, 22),
  },
  call: 'Gantt.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Gantt.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
