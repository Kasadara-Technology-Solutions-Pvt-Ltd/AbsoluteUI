// R20 P9 page: Mention Input, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { MentionInput, type MentionInputValueDetail, type MentionSuggestion, type MentionTrigger } from '@absoluteui/components/mention-input';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const PEOPLE: MentionSuggestion[] = [
  { id: 'u1', label: 'Ana', description: 'People team' },
  { id: 'u2', label: 'Andre', description: 'Engineering' },
  { id: 'u3', label: 'Ben', description: 'Finance' },
];
const TAGS: MentionSuggestion[] = [{ id: 't1', label: 'onboarding' }, { id: 't2', label: 'payroll' }];
const search = (list: MentionSuggestion[]) => (query: string, { signal }: { signal: AbortSignal }): Promise<readonly MentionSuggestion[]> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(list.filter((s) => s.label.toLowerCase().startsWith(query.toLowerCase())));
    }, 30);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
const triggers: MentionTrigger[] = [
  { char: '@', label: '@ for people', provider: search(PEOPLE) },
  { char: '#', label: '# for tags', provider: search(TAGS) },
];

const comment = MentionInput.create(byId('mention-comment'), { label: 'Comment', name: 'comment', maxLength: 200, showCounter: true, debounce: 50, triggers });
comment.host.addEventListener('aui-change', (e) => {
  const { value } = (e as CustomEvent<MentionInputValueDetail>).detail;
  byId('mention-output').textContent = `${value.text} | ${value.mentions.map((m) => m.id).join(',')}`;
});
MentionInput.create(byId('mention-single'), { label: 'Assign to', multiline: false, debounce: 50, triggers: [triggers[0] ?? { char: '@', provider: search(PEOPLE) }] });
MentionInput.create(byId('mention-readonly'), { label: 'Read-only note', readOnly: true, triggers, value: { text: 'Ask @Ana', mentions: [{ id: 'u1', label: 'Ana', trigger: '@', start: 4, end: 8 }] } });
MentionInput.create(byId('mention-disabled'), { label: 'Disabled note', disabled: true, triggers });
MentionInput.create(byId('mention-invalid'), { label: 'Required note', required: true, triggers }).reportValidity();

Object.assign(window, { __auiReady: true });
