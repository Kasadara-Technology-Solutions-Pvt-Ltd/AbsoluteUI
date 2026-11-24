import { TreeSelect, type TreeSelectOptions } from '@absoluteui/components/tree-select';
import { host, seed } from '../seed.js';

export default seed<TreeSelectOptions>({
  options: {
    label: 'Department',
    nodes: [
      { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web' }, { id: 'platform', label: 'Platform' }, { id: 'data', label: 'Data' }] },
      { id: 'ops', label: 'Operations', children: [{ id: 'facilities', label: 'Facilities' }, { id: 'it', label: 'IT support' }] },
      { id: 'people', label: 'People and Culture' },
    ],
    mode: 'single',
    value: ['platform'],
    name: 'department',
    placeholder: 'Choose a department',
    description: 'Type to filter the tree.',
    required: true,
    clearable: true,
    selectableParents: true,
  },
  call: 'TreeSelect.create(host, $)',
  adjust(name, value, current) {
    // Single mode allows one value.
    if (name === 'mode' && value === 'single' && (current.value?.length ?? 0) > 1) return { value: current.value?.slice(0, 1) };
    return undefined;
  },
  mount(stage, options) {
    const h = host(stage);
    const c = TreeSelect.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
