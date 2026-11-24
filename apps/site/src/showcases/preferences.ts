// Preferences showcase: a personal settings page with the new form controls. An accent
// color with swatches, a contrast hint, and the eyedropper where supported; a satisfaction rating
// with half steps; team assignment between two searchable lists (with drag); a work location
// cascader whose cities load from a simulated server; a mention comment box with @people and
// #tags from a simulated directory; a masked phone number; and an acknowledgement signature.
import { Cascader, type CascaderOption, type CascaderValue } from '@absoluteui/components/cascader';
import { ColorPicker } from '@absoluteui/components/color-picker';
import { MaskedInput, MASK_PRESETS } from '@absoluteui/components/masked-input';
import { MentionInput, type MentionSuggestion } from '@absoluteui/components/mention-input';
import { Rating } from '@absoluteui/components/rating';
import { SignaturePad } from '@absoluteui/components/signature-pad';
import { TransferList, type TransferListItem } from '@absoluteui/components/transfer-list';
import { action, choice, createShowcase, hostIn, section, status, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Personal preferences',
  description: 'Pick an accent color, rate onboarding, choose your team and location, leave a comment with mentions, and sign.',
  simulated: true,
});

// Appearance: color.
const appearance = section(sc, 'Appearance', ['color-picker']);
const color = ColorPicker.create(hostIn(appearance), {
  label: 'Accent color',
  description: 'Used for your calendar entries and highlights.',
  value: '#2563eb',
  presets: [
    { value: '#2563eb', label: 'Blue' },
    { value: '#15803d', label: 'Green' },
    { value: '#b45309', label: 'Amber' },
    { value: '#b91c1c', label: 'Red' },
    { value: '#7c3aed', label: 'Violet' },
  ],
  recent: ['#0f766e', '#be185d'],
  contrastWith: '#ffffff',
  name: 'accent',
});
sc.listen(color.host, ['aui-change'], 'color');

// Feedback: rating.
const feedback = section(sc, 'Feedback', ['rating']);
const rating = Rating.create(hostIn(feedback), {
  label: 'How was your onboarding?',
  allowHalf: true,
  value: 4,
  labels: ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'],
  name: 'onboarding',
});
sc.listen(rating.host, ['aui-change'], 'rating');
Rating.create(hostIn(feedback), { label: 'Team average', value: 4.5, allowHalf: true, display: true, size: 'sm' });

// Team: transfer list over a realistic directory size.
const team = section(sc, 'Team', ['transfer-list']);
const FIRST = ['Ana', 'Ben', 'Chen', 'Divya', 'Elif', 'Farah', 'Goran', 'Hana', 'Ivan', 'Jun', 'Kofi', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya'];
const LAST = ['Ruiz', 'Okafor', 'Wang', 'Iyer', 'Kaya', 'Haddad', 'Petrov', 'Sato', 'Novak', 'Kim', 'Mensah', 'Fischer', 'Silva', 'Berg', 'Aziz', 'Rao'];
const people: TransferListItem[] = [];
for (let i = 0; i < 240; i++) {
  const name = `${FIRST[i % FIRST.length] ?? ''} ${LAST[Math.floor(i / FIRST.length) % LAST.length] ?? ''}`;
  people.push({ value: `p${String(i)}`, label: name, description: ['Engineering', 'Finance', 'People', 'Sales'][i % 4] ?? '', ...(i % 37 === 5 ? { disabled: true } : {}) });
}
const transfer = TransferList.create(hostIn(team), { label: 'Project team', items: people, value: ['p1', 'p2'], draggable: true, maxSelected: 12, name: 'team' });
sc.listen(transfer.host, ['aui-change'], 'team');

// Location: lazy cascader.
const location = section(sc, 'Work location', ['cascader']);
const CITIES: Record<string, string[]> = {
  'de/by': ['Munich', 'Nuremberg', 'Augsburg'],
  'de/be': ['Berlin'],
  'in/ka': ['Bengaluru', 'Mysuru'],
  'in/mh': ['Mumbai', 'Pune'],
  'us/ca': ['San Francisco', 'Los Angeles', 'San Diego'],
  'us/ny': ['New York', 'Buffalo'],
};
const places: CascaderOption[] = [
  { value: 'de', label: 'Germany', children: [{ value: 'by', label: 'Bavaria' }, { value: 'be', label: 'Berlin' }] },
  { value: 'in', label: 'India', children: [{ value: 'ka', label: 'Karnataka' }, { value: 'mh', label: 'Maharashtra' }] },
  { value: 'us', label: 'United States', children: [{ value: 'ca', label: 'California' }, { value: 'ny', label: 'New York' }] },
];
const cascader = Cascader.create(hostIn(location), {
  label: 'Office',
  options: places,
  value: ['de', 'by', 'munich'],
  levelLabels: ['Country', 'State', 'City'],
  name: 'office',
  loadChildren: async (_option, { signal, path }) => {
    await wait(500, signal);
    sc.log('server answered', { path });
    return (CITIES[path.join('/')] ?? []).map((city) => ({ value: city.toLowerCase().replace(/\s+/g, '-'), label: city, isLeaf: true }));
  },
});
sc.listen(cascader.host, ['aui-change'], 'cascader');

// Comment: mentions from a simulated directory.
const comment = section(sc, 'Comment', ['mention-input']);
const TAGS = ['onboarding', 'payroll', 'benefits', 'equipment', 'training'];
const findPeople = async (query: string, signal: AbortSignal): Promise<MentionSuggestion[]> => {
  await wait(250, signal);
  const q = query.toLowerCase();
  return people.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 8).map((p) => ({ id: p.value, label: p.label, description: p.description ?? '' }));
};
const mention = MentionInput.create(hostIn(comment), {
  label: 'Note for your manager',
  description: 'Type @ to mention a colleague or # to add a topic.',
  maxLength: 500,
  showCounter: true,
  name: 'note',
  triggers: [
    { char: '@', label: '@ for people', provider: (query, { signal }) => findPeople(query, signal) },
    { char: '#', label: '# for topics', provider: async (query, { signal }) => {
      await wait(150, signal);
      return TAGS.filter((t) => t.startsWith(query.toLowerCase())).map((t) => ({ id: t, label: t }));
    } },
  ],
});
sc.listen(mention.host, ['aui-change', 'aui-mention'], 'mention');

// Contact: masked phone number.
const contact = section(sc, 'Contact', ['masked-input']);
const phone = MaskedInput.create(hostIn(contact), { label: 'Mobile phone', name: 'phone', ...MASK_PRESETS.phoneUs });
sc.listen(phone.host, ['aui-change'], 'phone');

// Acknowledgement: signature.
const sign = section(sc, 'Acknowledgement', ['signature-pad']);
const signature = SignaturePad.create(hostIn(sign), { label: 'Signature', description: 'Draw your signature, or choose Type to enter your full name.', required: true, name: 'signature' });
sc.listen(signature.host, ['aui-change'], 'signature');
const summary = status(sign);
const summarize = (): void => {
  const v = signature.value;
  summary.textContent = v === null ? 'Not signed yet.' : v.mode === 'type' ? `Signed as ${v.text}.` : `Signed with ${String(v.strokes.length)} strokes.`;
};
signature.host.addEventListener('aui-change', summarize);
summarize();

// Options.
const controls = [color, rating, transfer, cascader, mention, phone, signature];
toggle(sc, 'Disabled', false, (disabled) => {
  for (const c of controls) c.update({ disabled });
});
toggle(sc, 'Read-only', false, (readOnly) => {
  for (const c of controls) c.update({ readOnly });
});
choice(
  sc,
  'Color picker',
  [
    { value: 'popup', label: 'Popup' },
    { value: 'inline', label: 'Inline' },
  ],
  'popup',
  (mode) => {
    color.update({ mode });
  },
  ['color-picker'],
);
toggle(sc, 'Half stars', true, (allowHalf) => {
  rating.update({ allowHalf });
}, ['rating']);
/** A single path (strings), as opposed to a list of paths. */
const isPath = (v: CascaderValue): v is readonly string[] => v?.every((part) => typeof part === 'string') === true;
toggle(sc, 'Several offices', false, (multiple) => {
  const current = cascader.value;
  cascader.update({ multiple, value: multiple ? (isPath(current) ? [current] : []) : null });
}, ['cascader']);
action(sc, 'Validate', () => {
  const invalid = controls.filter((c) => !c.reportValidity());
  sc.log('validate', { invalid: invalid.map((c) => c.label) });
});
action(sc, 'Reset', () => {
  for (const c of controls) c.reset();
  summarize();
  sc.log('reset');
});
