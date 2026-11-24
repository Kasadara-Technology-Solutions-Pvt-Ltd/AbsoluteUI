import { Kanban, type KanbanOptions } from '@absoluteui/components/kanban';
import { host, seed } from '../seed.js';

export default seed<KanbanOptions>({
  options: {
    label: 'Candidates',
    columns: [
      { id: 'applied', label: 'Applied' },
      { id: 'screening', label: 'Screening', wipLimit: 2 },
      { id: 'interview', label: 'Interview', wipLimit: 2 },
      { id: 'offer', label: 'Offer', wipLimit: 1 },
      { id: 'hired', label: 'Hired', locked: true },
    ],
    lanes: [
      { id: 'engineering', label: 'Engineering' },
      { id: 'sales', label: 'Sales' },
    ],
    cards: [
      { id: 'c1', columnId: 'applied', laneId: 'engineering', title: 'Ada K.', description: 'Backend engineer', tags: ['Referral'] },
      { id: 'c2', columnId: 'applied', laneId: 'sales', title: 'Bruno S.', description: 'Account executive' },
      { id: 'c3', columnId: 'screening', laneId: 'engineering', title: 'Chen W.', description: 'Frontend engineer' },
      { id: 'c4', columnId: 'screening', laneId: 'sales', title: 'Divya N.', description: 'Sales manager', tags: ['Referral'] },
      { id: 'c5', columnId: 'interview', laneId: 'engineering', title: 'Emeka O.', description: 'Platform engineer' },
      { id: 'c6', columnId: 'offer', laneId: 'sales', title: 'Farah H.', description: 'Account executive' },
      { id: 'c7', columnId: 'hired', laneId: 'engineering', title: 'Grace L.', description: 'Data engineer' },
    ],
    editable: true,
    wipPolicy: 'warn',
  },
  call: 'Kanban.create(host, $)',
  note: 'Drag a card, or focus it and press Space, move with the arrow keys, and press Space again.',
  mount(stage, options) {
    const h = host(stage);
    const c = Kanban.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
