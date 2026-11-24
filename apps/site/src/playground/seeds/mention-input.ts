import { MentionInput, type MentionInputOptions, type MentionSuggestion } from '@absoluteui/components/mention-input';
import { host, seed } from '../seed.js';

const PEOPLE: MentionSuggestion[] = [
  { id: 'u1', label: 'Ana', description: 'People team' },
  { id: 'u2', label: 'Andre', description: 'Engineering' },
  { id: 'u3', label: 'Ben', description: 'Finance' },
];
const TAGS: MentionSuggestion[] = [{ id: 't1', label: 'onboarding' }, { id: 't2', label: 'payroll' }];
const match = (list: MentionSuggestion[]) => (query: string): Promise<readonly MentionSuggestion[]> => Promise.resolve(list.filter((s) => s.label.toLowerCase().startsWith(query.toLowerCase())));

export default seed<MentionInputOptions>({
  options: {
    label: 'Comment',
    maxLength: 280,
    showCounter: true,
    triggers: [
      { char: '@', label: '@ for people', provider: match(PEOPLE) },
      { char: '#', label: '# for tags', provider: match(TAGS) },
    ],
  },
  call: 'MentionInput.create(host, $)',
  codeValues: {
    triggers: "[{ char: '@', label: '@ for people', provider: searchPeople }, { char: '#', label: '# for tags', provider: searchTags }]",
  },
  hide: ['triggers', 'multiline'],
  note: 'Type @ or # to open suggestions.',
  mount(stage, options) {
    const h = host(stage);
    const c = MentionInput.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
