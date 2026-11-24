import { instant } from '@absoluteui/core';
import { Timeline, type TimelineOptions } from '@absoluteui/components/timeline';
import { host, seed } from '../seed.js';

const now = Date.now();
const hour = 3_600_000;

export default seed<TimelineOptions>({
  options: {
    label: 'Document activity',
    initialVisible: 4,
    items: [
      { id: 'approved', title: 'Leave policy approved', tone: 'success', time: instant(now - hour), avatar: { name: 'Ada Lovelace' }, actions: [{ id: 'open', label: 'Open' }] },
      { id: 'review', title: 'Review requested', tone: 'info', time: instant(now - 3 * hour), description: 'Sent to the People team.' },
      { id: 'scan', title: 'Virus scan failed', tone: 'error', status: 'Blocked', time: instant(now - 5 * hour) },
      { id: 'comment', title: 'Comment added', time: instant(now - 26 * hour), description: 'Please shorten section 3.' },
      { id: 'draft', title: 'Draft uploaded', tone: 'warning', status: 'Needs review', time: instant(now - 50 * hour) },
      { id: 'created', title: 'Folder created', time: instant(now - 75 * hour) },
    ],
  },
  call: 'Timeline.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Timeline.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
