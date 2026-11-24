import { instant } from '@absoluteui/core';
import { Discussion, type DiscussionOptions } from '@absoluteui/components/discussion';
import { host, seed } from '../seed.js';

const ago = (minutes: number): ReturnType<typeof instant> => instant(Date.now() - minutes * 60_000);
const ada = { id: 'ada', name: 'Ada Lovelace' };
const grace = { id: 'grace', name: 'Grace Hopper' };

export default seed<DiscussionOptions>({
  options: {
    label: 'Comments',
    currentUser: ada,
    maxLength: 280,
    comments: [
      { id: 'c1', parentId: null, author: grace, text: 'The new leave policy starts in January.', createdAt: ago(180) },
      { id: 'c2', parentId: 'c1', author: ada, text: 'Thanks @Grace Hopper, does it cover part-time staff?', mentions: [{ id: 'grace', label: 'Grace Hopper', trigger: '@', start: 7, end: 20 }], createdAt: ago(120) },
      { id: 'c3', parentId: 'c2', author: grace, text: 'Yes, pro rata.', createdAt: ago(30) },
    ],
  },
  call: 'Discussion.create(host, $)',
  note: 'Reply, mention with @, edit or delete your own comments (Ada Lovelace). Changes stay in this page.',
  mount(stage, options) {
    const h = host(stage);
    const c = Discussion.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
