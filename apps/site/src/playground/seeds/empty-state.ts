import { EmptyState, type EmptyStateOptions } from '@absoluteui/components/empty-state';
import { host, seed } from '../seed.js';

export default seed<EmptyStateOptions>({
  options: {
    title: 'No employees match your filters',
    description: 'Try a different name or clear the filters.',
    icon: 'search',
    primaryAction: { label: 'Clear filters' },
    secondaryAction: { label: 'Add employee', icon: 'plus' },
  },
  call: 'EmptyState.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = EmptyState.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
