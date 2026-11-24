// Kanban showcase: a recruitment board with swimlanes, WIP limits (warn or block), moves saved
// to a simulated server that sometimes fails (the move rolls back), keyboard moves, and undo.
import { Kanban, type KanbanCard, type KanbanCardMoveDetail } from '@absoluteui/components/kanban';
import { action, choice, createShowcase, hostIn, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Recruitment board',
  description: 'Move candidates by dragging, or with the keyboard (Space to grab, arrows to move, Space to drop). Saves go to a simulated server; a failed save rolls back.',
  simulated: true,
});

let failRate = 0;
const NAMES = ['Ada K.', 'Bruno S.', 'Chen W.', 'Divya N.', 'Emeka O.', 'Farah H.', 'Grace L.', 'Hiro T.', 'Inés G.', 'Jonas B.', 'Kofi M.', 'Lena N.'];
const COLS = ['applied', 'screening', 'interview', 'offer', 'hired'];
const cards: KanbanCard[] = NAMES.map((name, i) => ({
  id: `c${String(i)}`,
  columnId: COLS[Math.min(i % 5, 4)] ?? 'applied',
  laneId: i % 2 === 0 ? 'engineering' : 'sales',
  title: name,
  description: i % 2 === 0 ? 'Backend engineer' : 'Account executive',
  tags: i % 3 === 0 ? ['Referral'] : [],
}));

const host = hostIn(sc.stage);
const board = Kanban.create(host, {
  label: 'Candidates',
  columns: [
    { id: 'applied', label: 'Applied' },
    { id: 'screening', label: 'Screening', wipLimit: 3 },
    { id: 'interview', label: 'Interview', wipLimit: 3 },
    { id: 'offer', label: 'Offer', wipLimit: 2 },
    { id: 'hired', label: 'Hired', locked: true },
  ],
  lanes: [
    { id: 'engineering', label: 'Engineering' },
    { id: 'sales', label: 'Sales' },
  ],
  cards,
  editable: true,
  columnReorder: true,
  wipPolicy: 'warn',
  moveCard: async (move: KanbanCardMoveDetail, signal) => {
    await wait(400, signal);
    if (Math.random() < failRate) throw new Error('The server answered 409.');
  },
});
sc.listen(host, ['aui-card-move', 'aui-move-error', 'aui-card-activate', 'aui-column-move', 'aui-collapse-change'], 'board');

choice(
  sc,
  'WIP limits',
  [
    { value: 'warn', label: 'Warn' },
    { value: 'block', label: 'Block' },
  ],
  'warn',
  (wipPolicy) => {
    board.update({ wipPolicy });
  },
);
choice(
  sc,
  'Save failures',
  [
    { value: '0', label: 'Never' },
    { value: '0.5', label: 'Half of the time' },
    { value: '1', label: 'Always' },
  ],
  '0',
  (v) => {
    failRate = Number(v);
  },
);
toggle(sc, 'Editable', true, (editable) => {
  board.update({ editable });
});
action(sc, 'Undo', () => {
  board.undo();
});
