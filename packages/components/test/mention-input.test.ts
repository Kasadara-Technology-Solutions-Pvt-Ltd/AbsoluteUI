import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { MentionInput, mentionInputConfig, type MentionInputOptions, type MentionInputValueDetail, type MentionSuggestion } from '@absoluteui/components/mention-input';
import { diffRange, shiftMentions } from '../src/mention-input/mention-input.js';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const PEOPLE: MentionSuggestion[] = [
  { id: 'u1', label: 'Ana', description: 'People team' },
  { id: 'u2', label: 'Andre' },
  { id: 'u3', label: 'Ben' },
];
const people = (query: string): Promise<readonly MentionSuggestion[]> => Promise.resolve(PEOPLE.filter((p) => p.label.toLowerCase().startsWith(query.toLowerCase())));

function mount(options: Partial<MentionInputOptions> = {}): MentionInput {
  const host = document.createElement('div');
  document.body.append(host);
  return MentionInput.create(host, { label: 'Comment', debounce: 0, triggers: [{ char: '@', label: '@ for people', provider: people }, { char: '#', provider: () => Promise.resolve([{ id: 't1', label: 'payroll' }]) }], ...options });
}

const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.aui-mention-input__popup [role="option"]')];
const settle = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 20));
};

describe('MentionInput', () => {
  it('renders a labelled textarea with a trigger hint in its description', () => {
    const m = mount({ description: 'Mention colleagues' });
    expect(m.input.tagName).toBe('TEXTAREA');
    expect(m.input.labels?.[0]?.textContent).toContain('Comment');
    const described = (m.input.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain('Mention colleagues');
    expect(described.some((t) => t?.includes('@ for people'))).toBe(true);
    expect(m.input.getAttribute('aria-autocomplete')).toBe('list');
    expect(getFormControl(m.host)).toBe(m);
  });

  it('opens suggestions on the trigger, navigates with arrows, and inserts with Enter', async () => {
    const m = mount();
    const changes: MentionInputValueDetail[] = [];
    m.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<MentionInputValueDetail>).detail));
    m.input.focus();
    await userEvent.keyboard('Hi @an');
    await settle();
    expect(m.expanded).toBe(true);
    expect(options().map((o) => o.textContent)).toEqual(['@AnaPeople team', '@Andre']);
    expect(m.input.getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(m.expanded).toBe(false);
    expect(m.value.text).toBe('Hi @Andre ');
    expect(m.value.mentions).toEqual([{ id: 'u2', label: 'Andre', trigger: '@', start: 3, end: 9 }]);
    expect(changes).toHaveLength(1);
    expect(m.input.selectionStart).toBe(10);
  });

  it('keeps offsets in sync when text is inserted before a mention, and drops a mention edited inside', async () => {
    const m = mount({ value: { text: 'cc @Ana now', mentions: [{ id: 'u1', label: 'Ana', trigger: '@', start: 3, end: 7 }] } });
    m.input.focus();
    m.input.setSelectionRange(0, 0);
    await userEvent.keyboard('X');
    expect(m.value.mentions[0]).toMatchObject({ start: 4, end: 8 });
    m.input.setSelectionRange(6, 6);
    await userEvent.keyboard('z');
    expect(m.value.text).toBe('Xcc @Azna now');
    expect(m.value.mentions).toEqual([]);
  });

  it('does not open for a trigger inside a word (email address) and Escape dismisses', async () => {
    const m = mount();
    m.input.focus();
    await userEvent.keyboard('ana@ex');
    await settle();
    expect(m.expanded).toBe(false);
    await userEvent.keyboard(' #');
    await settle();
    expect(m.expanded).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(m.expanded).toBe(false);
    await userEvent.keyboard('p');
    await settle();
    expect(m.expanded).toBe(false);
  });

  it('aborts superseded queries and never shows stale answers', async () => {
    const signals: AbortSignal[] = [];
    let release: (() => void) | undefined;
    const slow = (query: string, { signal }: { signal: AbortSignal }): Promise<readonly MentionSuggestion[]> => {
      signals.push(signal);
      if (query === 'a') return new Promise((resolve) => { release = () => { resolve([{ id: 'old', label: 'Old' }]); }; });
      return Promise.resolve([{ id: 'new', label: 'Anew' }]);
    };
    const m = mount({ triggers: [{ char: '@', provider: slow }] });
    m.input.focus();
    await userEvent.keyboard('@a');
    await settle();
    await userEvent.keyboard('n');
    await settle();
    release?.();
    await settle();
    expect(signals[signals.length - 2]?.aborted).toBe(true);
    expect(options().map((o) => o.textContent)).toEqual(['@Anew']);
  });

  it('Enter while a newer query is pending never inserts a suggestion of the previous query (regression)', async () => {
    const m = mount({ debounce: 400 });
    m.input.focus();
    await userEvent.keyboard('@a');
    await expect.poll(() => options().map((o) => o.textContent), { timeout: 2000 }).toEqual(['@AnaPeople team', '@Andre']);
    // "@and" is still debouncing: the "@a" results are gone, so Enter cannot pick "Ana".
    await userEvent.keyboard('nd');
    expect(options()).toEqual([]);
    expect(m.input.hasAttribute('aria-activedescendant')).toBe(false);
    await userEvent.keyboard('{Enter}');
    expect(m.value.mentions).toEqual([]);
    expect(m.value.text.startsWith('@and')).toBe(true);
  });

  it('debounces provider calls', async () => {
    const provider = vi.fn(() => Promise.resolve<readonly MentionSuggestion[]>([]));
    // Each CDP key press is a round trip; under load the gap between keys can exceed a short
    // debounce, so the delay is generous enough that the four keys always land within it.
    const m = mount({ debounce: 400, triggers: [{ char: '@', provider }] });
    m.input.focus();
    await userEvent.keyboard('@abc');
    expect(provider).not.toHaveBeenCalled();
    await expect.poll(() => provider.mock.calls.length, { timeout: 2000 }).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]).toEqual(['abc', expect.objectContaining({ trigger: '@' })]);
    expect(document.querySelector('.aui-mention-input__status')?.textContent).toBe('No matches');
  });

  it('shows a failure status when the provider rejects', async () => {
    const m = mount({ triggers: [{ char: '@', provider: () => Promise.reject(new Error('down')) }] });
    m.input.focus();
    await userEvent.keyboard('@a');
    await settle();
    expect(document.querySelector('.aui-mention-input__status')?.textContent).toBe('Suggestions could not be loaded.');
  });

  it('single-line mode uses the combobox role with aria-expanded', async () => {
    const m = mount({ multiline: false });
    expect(m.input.getAttribute('role')).toBe('combobox');
    expect(m.input.getAttribute('aria-expanded')).toBe('false');
    m.input.focus();
    await userEvent.keyboard('@b');
    await settle();
    expect(m.input.getAttribute('aria-expanded')).toBe('true');
    expect(m.input.getAttribute('aria-controls')).toBe(document.querySelector('[role="listbox"]')?.id);
  });

  it('validates required and maxLength, serializes JSON to the hidden input, and resets', async () => {
    const m = mount({ required: true, name: 'comment', maxLength: 5, showCounter: true });
    expect(m.reportValidity()).toBe(false);
    expect(m.validity.error).toBe('value-missing');
    m.input.focus();
    await userEvent.keyboard('abcdef');
    expect(m.validity.error).toBe('too-long');
    expect(m.host.querySelector('.aui-field__counter')?.textContent).toBe('1 character too many');
    const hidden = m.host.querySelector<HTMLInputElement>('input[type="hidden"]');
    expect(JSON.parse(hidden?.value ?? '')).toEqual({ text: 'abcdef', mentions: [] });
    expect(hidden?.name).toBe('comment');
    m.reset();
    expect(m.value.text).toBe('');
    expect(m.dirty).toBe(false);
  });

  it('read-only and disabled fields never open suggestions', async () => {
    const m = mount({ readOnly: true });
    m.input.focus();
    await userEvent.keyboard('@a');
    await settle();
    expect(m.expanded).toBe(false);
    m.update({ readOnly: false, disabled: true });
    expect(m.input.disabled).toBe(true);
  });

  it('rejects invalid options before touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => MentionInput.create(host, { label: ' ', triggers: [{ char: '@', provider: people }] })).toThrow(AbsoluteUIError);
    expect(() => MentionInput.create(host, { label: 'x', triggers: [] })).toThrow(AbsoluteUIError);
    expect(() => MentionInput.create(host, { label: 'x', triggers: [{ char: '@@', provider: people }] })).toThrow(AbsoluteUIError);
    expect(() => MentionInput.create(host, { label: 'x', triggers: [{ char: '@', provider: people }], value: { text: 'hi', mentions: [{ id: 'u', label: 'Ana', trigger: '@', start: 0, end: 4 }] } })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
  });

  it('global configuration applies and is validated', () => {
    configureAbsoluteUI({ components: { mentionInput: { maxSuggestions: 2 } } });
    expect(mentionInputConfig.resolve({}).maxSuggestions).toBe(2);
    expect(() => {
      configureAbsoluteUI({ components: { mentionInput: { debounce: -1 } } });
    }).toThrow(AbsoluteUIError);
  });

  it('diffRange resolves repeated characters with the caret; shiftMentions shifts and drops', () => {
    expect(diffRange('aa', 'aaa', 1)).toEqual({ from: 0, oldTo: 0, newTo: 1 });
    expect(diffRange('abc', 'ac', 1)).toEqual({ from: 1, oldTo: 2, newTo: 1 });
    const m = [{ id: 'a', label: 'A', trigger: '@', start: 2, end: 4 }];
    expect(shiftMentions(m, 0, 0, 2)[0]).toMatchObject({ start: 4, end: 6 });
    expect(shiftMentions(m, 4, 4, 1)[0]).toMatchObject({ start: 2, end: 4 });
    expect(shiftMentions(m, 3, 3, 1)).toEqual([]);
  });

  it('destroy clears the host and registration', () => {
    const m = mount();
    m.destroy();
    expect(m.host.childElementCount).toBe(0);
    expect(getFormControl(m.host)).toBeUndefined();
  });
});

describe('MentionInput suggestions name', () => {
  it('labels the suggestion listbox with the field label (regression)', () => {
    const m = mount();
    const list = m.host.querySelector('[role="listbox"]');
    const label = m.host.querySelector('label');
    expect(label?.id).toBeTruthy();
    expect(list?.getAttribute('aria-labelledby')).toBe(label?.id);
  });
});

describe('MentionInput closed popup', () => {
  it('is a popover from creation, so it is not displayed before it first opens (regression)', () => {
    const m = mount();
    const popup = m.host.querySelector<HTMLElement>('.aui-mention-input__popup');
    expect(popup?.getAttribute('popover')).toBe('manual');
    expect(popup?.matches(':popover-open')).toBe(false);
  });
});
