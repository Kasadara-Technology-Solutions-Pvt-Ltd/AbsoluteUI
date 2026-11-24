import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { PromptInput, type PromptInputAttachmentChangeDetail, type PromptInputOptions, type PromptInputSendDetail, type PromptInputSuggestionSelectDetail } from '@absoluteui/components/prompt-input';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<PromptInputOptions> = {}): PromptInput {
  const host = document.createElement('div');
  document.body.append(host);
  return PromptInput.create(host, { label: 'Message', ...options });
}

const sendButton = (p: PromptInput): HTMLButtonElement => p.host.querySelector<HTMLButtonElement>('.aui-prompt-input__send')!;
const sent = (p: PromptInput): PromptInputSendDetail[] => {
  const list: PromptInputSendDetail[] = [];
  p.host.addEventListener('aui-send', (e) => list.push((e as CustomEvent<PromptInputSendDetail>).detail));
  return list;
};
const file = (name: string, size = 10, type = 'text/plain'): File => new File(['x'.repeat(size)], name, { type });

describe('PromptInput', () => {
  it('renders a labelled multi-line field registered as a form control', () => {
    const p = mount({ description: 'Ask anything' });
    expect(p.textarea.labels[0]?.textContent).toContain('Message');
    expect(p.textarea.getAttribute('aria-multiline')).toBe('true');
    expect(p.textarea.getAttribute('aria-describedby')).toContain(p.host.querySelector('.aui-field__description')!.id);
    expect(getFormControl(p.host)).toBe(p);
    expect(sendButton(p).getAttribute('aria-label')).toBe('Send message');
    // Nothing to send: the button stays focusable but is marked unavailable.
    expect(sendButton(p).getAttribute('aria-disabled')).toBe('true');
  });

  it('Enter sends and clears; Shift+Enter inserts a line break', async () => {
    const p = mount();
    const list = sent(p);
    await userEvent.click(p.textarea);
    await userEvent.keyboard('Hello{Shift>}{Enter}{/Shift}world');
    expect(p.value).toBe('Hello\nworld');
    await userEvent.keyboard('{Enter}');
    expect(list).toEqual([{ text: 'Hello\nworld', attachments: [] }]);
    expect(p.value).toBe('');
    expect(document.activeElement).toBe(p.textarea);
  });

  it('submitKey mod-enter: Enter is a new line and Ctrl+Enter sends', async () => {
    const p = mount({ submitKey: 'mod-enter' });
    const list = sent(p);
    await userEvent.click(p.textarea);
    await userEvent.keyboard('a{Enter}b');
    expect(list).toHaveLength(0);
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(list.map((d) => d.text)).toEqual(['a\nb']);
  });

  it('whitespace-only text is not sent; a prevented send keeps the text', () => {
    const p = mount();
    const list = sent(p);
    p.setValue('   ');
    expect(p.send()).toBe(false);
    p.setValue('Keep me');
    p.host.addEventListener('aui-send', (e) => {
      e.preventDefault();
    }, { once: true });
    expect(p.send()).toBe(false);
    expect(p.value).toBe('Keep me');
    expect(list).toHaveLength(1);
  });

  it('streaming turns Send into Stop and emits aui-stop; Enter does not send meanwhile', async () => {
    const p = mount({ value: 'next question' });
    const list = sent(p);
    const stops = vi.fn();
    p.host.addEventListener('aui-stop', stops);
    p.update({ status: 'streaming' });
    expect(sendButton(p).getAttribute('aria-label')).toBe('Stop generating');
    expect(p.host.classList.contains('aui-prompt-input--streaming')).toBe(true);
    expect(p.textarea.readOnly).toBe(false);
    await userEvent.click(p.textarea);
    await userEvent.keyboard('{Enter}');
    expect(list).toHaveLength(0);
    await userEvent.click(sendButton(p));
    expect(stops).toHaveBeenCalledTimes(1);
    p.update({ status: 'sending' });
    expect(p.textarea.readOnly).toBe(true);
  });

  it('attachments: limits by type, size, and count; chips with remove buttons', async () => {
    const p = mount({ attachments: true, accept: ['.txt', 'image/*'], maxFileSize: 100, maxFiles: 2 });
    const changes: PromptInputAttachmentChangeDetail[] = [];
    p.host.addEventListener('aui-attachment-change', (e) => changes.push((e as CustomEvent<PromptInputAttachmentChangeDetail>).detail));
    const rejected = p.addFiles([file('a.txt'), file('b.pdf', 10, 'application/pdf'), file('big.txt', 500), file('c.png', 10, 'image/png'), file('d.txt')]);
    expect(p.attachments.map((f) => f.name)).toEqual(['a.txt', 'c.png']);
    expect(rejected.map((r) => [r.file.name, r.reason])).toEqual([['b.pdf', 'type'], ['big.txt', 'size'], ['d.txt', 'count']]);
    expect(changes).toHaveLength(1);
    expect(p.host.querySelector('.aui-field__error')!.textContent).toContain('b.pdf is not an accepted file type.');
    const remove = [...p.host.querySelectorAll<HTMLButtonElement>('.aui-prompt-input__chip-remove')];
    expect(remove.map((b) => b.getAttribute('aria-label'))).toEqual(['Remove a.txt', 'Remove c.png']);
    await userEvent.click(remove[0]!);
    expect(p.attachments.map((f) => f.name)).toEqual(['c.png']);
    expect(document.activeElement).toBe(p.host.querySelector('.aui-prompt-input__chip-remove'));
  });

  it('files alone can be sent and travel in aui-send', () => {
    const p = mount({ attachments: true });
    const list = sent(p);
    p.addFiles([file('notes.txt')]);
    expect(sendButton(p).hasAttribute('aria-disabled')).toBe(false);
    expect(p.send()).toBe(true);
    expect(list[0]!.attachments.map((f) => f.name)).toEqual(['notes.txt']);
    expect(p.attachments).toEqual([]);
  });

  it('counter: characters by default, tokens with a count hook; over the limit is invalid', () => {
    const chars = mount({ maxLength: 5, showCounter: true, value: 'abc' });
    expect(chars.host.querySelector('.aui-field__counter')!.textContent).toBe('2 characters remaining');
    const tokens = mount({ maxLength: 3, showCounter: true, count: (t) => t.split(/\s+/).filter(Boolean).length, value: 'one two' });
    expect(tokens.host.querySelector('.aui-field__counter')!.textContent).toBe('2 of 3 tokens');
    tokens.setValue('one two three four');
    expect(tokens.validity.valid).toBe(false);
    expect(tokens.send()).toBe(false);
  });

  it('suggestions: a trigger opens a listbox; arrows move, Enter inserts', async () => {
    const p = mount({
      triggers: [{ char: '/', suggest: (q) => [{ insert: '/summarize', label: '/summarize', description: 'Summarize' }, { insert: '/translate', label: '/translate' }].filter((s) => s.label.slice(1).startsWith(q)) }],
    });
    const selected: PromptInputSuggestionSelectDetail[] = [];
    p.host.addEventListener('aui-suggestion-select', (e) => selected.push((e as CustomEvent<PromptInputSuggestionSelectDetail>).detail));
    await userEvent.click(p.textarea);
    await userEvent.keyboard('/');
    const listbox = p.host.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(listbox.hidden).toBe(false);
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(p.textarea.getAttribute('aria-activedescendant')).toBe(listbox.children[0]!.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(listbox.children[1]!.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(p.value).toBe('/translate ');
    expect(p.suggestionsOpen).toBe(false);
    expect(selected[0]!.suggestion.insert).toBe('/translate');
  });

  it('suggestions: the trigger only opens after a space; Escape closes; stale async answers are dropped', async () => {
    let resolveFirst: (v: { insert: string; label: string }[]) => void = () => undefined;
    const calls: string[] = [];
    const p = mount({
      triggers: [{
        char: '@',
        suggest: (q) => {
          calls.push(q);
          if (q === 'a') return new Promise((resolve) => { resolveFirst = resolve; });
          return Promise.resolve([{ insert: '@Ada', label: 'Ada' }]);
        },
      }],
    });
    await userEvent.click(p.textarea);
    await userEvent.keyboard('mail@x');
    expect(calls).toEqual([]);
    p.setValue('');
    await userEvent.keyboard('@a');
    await userEvent.keyboard('d');
    await vi.waitFor(() => {
      expect(p.suggestionsOpen).toBe(true);
    });
    resolveFirst([{ insert: '@Stale', label: 'Stale' }]);
    await Promise.resolve();
    expect(p.host.querySelector('[role="option"]')!.textContent).toBe('Ada');
    await userEvent.keyboard('{Escape}');
    expect(p.suggestionsOpen).toBe(false);
  });

  it('auto-grows between rows and maxRows', async () => {
    // Unit tests load no component stylesheets; growth comes from these rules of style.scss.
    const style = document.createElement('style');
    style.textContent = [
      '.aui-prompt-input__textarea{box-sizing:border-box;display:block;line-height:20px;padding:4px;border:0;overflow-y:auto;resize:none;',
      'min-block-size:calc(var(--aui-prompt-input-rows,1) * 1lh + 8px);max-block-size:calc(var(--aui-prompt-input-max-rows,8) * 1lh + 8px)}',
      '.aui-prompt-input--auto-native .aui-prompt-input__textarea{field-sizing:content}',
    ].join('');
    document.body.append(style);
    const p = mount({ rows: 1, maxRows: 3 });
    const initial = p.textarea.getBoundingClientRect().height;
    await userEvent.click(p.textarea);
    await userEvent.keyboard('1{Shift>}{Enter}{/Shift}2');
    expect(p.textarea.getBoundingClientRect().height).toBeGreaterThan(initial);
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}3{Shift>}{Enter}{/Shift}4{Shift>}{Enter}{/Shift}5');
    const three = p.textarea.getBoundingClientRect().height;
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}6');
    expect(p.textarea.getBoundingClientRect().height).toBe(three);
  });

  it('required: empty is invalid unless files are attached', () => {
    const p = mount({ required: true, attachments: true });
    expect(p.reportValidity()).toBe(false);
    p.addFiles([file('a.txt')]);
    expect(p.reportValidity()).toBe(true);
  });

  it('global config sets the submit key; invalid options throw before rendering', () => {
    configureAbsoluteUI({ components: { promptInput: { submitKey: 'mod-enter' } } });
    const p = mount({ showHint: true });
    expect(p.host.querySelector('.aui-prompt-input__hint')!.textContent).toBe('Ctrl+Enter to send, Enter for a new line');
    const host = document.createElement('div');
    host.textContent = 'untouched';
    expect(() => PromptInput.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => PromptInput.create(host, { label: 'x', showCounter: true })).toThrow(/Invalid prompt input options/);
    expect(() => PromptInput.create(host, { label: 'x', triggers: [{ char: '//', suggest: () => [] }] })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('untouched');
    expect(() => {
      p.update({ status: 'busy' as 'idle' });
    }).toThrow(AbsoluteUIError);
    expect(p.status).toBe('idle');
  });

  it('reset restores the initial value and removes files; destroy cleans up', () => {
    const p = mount({ value: 'draft', attachments: true });
    p.setValue('changed');
    p.addFiles([file('a.txt')]);
    expect(p.dirty).toBe(true);
    p.reset();
    expect(p.value).toBe('draft');
    expect(p.attachments).toEqual([]);
    p.destroy();
    expect(p.host.childElementCount).toBe(0);
    expect(p.host.classList.contains('aui-prompt-input')).toBe(false);
    expect(getFormControl(p.host)).toBeUndefined();
  });
});
