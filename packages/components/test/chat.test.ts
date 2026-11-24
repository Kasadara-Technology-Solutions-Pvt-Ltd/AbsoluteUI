import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, instant, plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import {
  Chat,
  type ChatAttachmentOpenDetail,
  type ChatFeedbackDetail,
  type ChatMessage,
  type ChatOptions,
  type ChatRetryDetail,
  type ChatSendDetail,
  type ChatSuggestionDetail,
} from '@absoluteui/components/chat';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<ChatOptions> = {}): Chat {
  const host = document.createElement('div');
  host.style.setProperty('block-size', '400px');
  document.body.append(host);
  return Chat.create(host, { label: 'Conversation', ...options });
}

/** An async iterable that yields each chunk after a tick; the test controls failure. */
async function* chunks(parts: readonly string[], options: { fail?: boolean; delay?: number } = {}): AsyncGenerator<string> {
  for (const part of parts) {
    await new Promise((resolve) => setTimeout(resolve, options.delay ?? 1));
    yield part;
  }
  if (options.fail === true) throw new Error('secret server detail');
}

const articles = (c: Chat): HTMLElement[] => [...c.host.querySelectorAll<HTMLElement>('article.aui-chat__message')];
const bubble = (c: Chat, id: string): HTMLElement => c.host.querySelector<HTMLElement>(`article[data-id="${id}"] .aui-chat__content`)!;
const at = (h: number, m = 0): ReturnType<typeof instant> => instant(Date.UTC(2026, 10, 20, h, m));

describe('Chat', () => {
  it('is a named log of articles named by author and time', () => {
    const c = mount({
      timezone: 'UTC',
      today: plainDate(2026, 11, 20),
      messages: [
        { id: '1', role: 'user', text: 'Hello', timestamp: at(9, 30) },
        { id: '2', role: 'assistant', text: 'Hi there', timestamp: at(9, 31) },
        { id: '3', role: 'system', text: 'Ada joined' },
      ],
    });
    const log = c.host.querySelector('[role="log"]')!;
    expect(log.getAttribute('aria-label')).toBe('Conversation');
    expect(log.getAttribute('aria-live')).toBe('off');
    const [user, assistant] = articles(c);
    const name = (el: HTMLElement): string => document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent;
    expect(name(user!)).toMatch(/^You 9:30\sAM$/);
    expect(name(assistant!)).toMatch(/^Assistant 9:31\sAM$/);
    expect(c.host.querySelector('.aui-chat__day')!.textContent).toBe('Today');
    expect(user!.querySelector('time')!.dateTime).toBe('2026-11-20T09:30:00.000Z');
  });

  it('day separators: yesterday, weekdays, holidays and non-working days from a business calendar', () => {
    const calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 11, 18), name: 'Founders Day' }] });
    const c = mount({
      timezone: 'UTC',
      today: plainDate(2026, 11, 20),
      businessCalendar: calendar,
      messages: [
        { id: 'a', role: 'user', text: 'Saturday', timestamp: instant(Date.UTC(2026, 10, 14, 10)) },
        { id: 'b', role: 'user', text: 'Holiday', timestamp: instant(Date.UTC(2026, 10, 18, 10)) },
        { id: 'c', role: 'user', text: 'Yesterday', timestamp: instant(Date.UTC(2026, 10, 19, 10)) },
      ],
    });
    const days = [...c.host.querySelectorAll('.aui-chat__day')].map((d) => d.textContent);
    expect(days[0]).toBe('Saturday, Nov 14 (non-working day)');
    expect(days[1]).toBe('Wednesday, Nov 18 (Founders Day)');
    expect(days[2]).toBe('Yesterday');
  });

  it('renders text messages as text and Markdown safely (no HTML, safe links only)', () => {
    const c = mount({
      messages: [
        { id: 'u', role: 'user', text: '<b>not bold</b> **not markdown**' },
        { id: 'a', role: 'assistant', text: '# Title\n\nSee [docs](https://example.com) and [bad](javascript:alert(1)) <img src=x onerror=alert(1)>\n\n- one\n- **two**\n  - nested\n\n```ts\nconst x = 1;\n```\n\nUse `code` and *em*.' },
      ],
    });
    expect(bubble(c, 'u').textContent).toBe('<b>not bold</b> **not markdown**');
    expect(bubble(c, 'u').querySelector('b, strong')).toBeNull();
    const md = bubble(c, 'a');
    expect(md.querySelector('h3')!.textContent).toBe('Title');
    const links = [...md.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com']);
    expect(links[0]!.rel).toBe('noopener noreferrer nofollow');
    expect(md.textContent).toContain('bad');
    expect(md.querySelector('img')).toBeNull();
    expect(md.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(md.querySelector('ul > li > strong')!.textContent).toBe('two');
    expect(md.querySelector('ul ul li')!.textContent).toBe('nested');
    expect(md.querySelector('pre code')!.textContent).toBe('const x = 1;');
    expect(md.querySelector('.aui-chat__code-language')!.textContent).toBe('ts');
    expect(md.querySelector('.aui-chat__code-copy')!.getAttribute('aria-label')).toBe('Copy code');
    expect(md.querySelector('p code')!.textContent).toBe('code');
    expect(md.querySelector('em')!.textContent).toBe('em');
  });

  it('keeps snake_case words and lone asterisks as text (regression)', () => {
    const c = mount({ messages: [{ id: 'a', role: 'assistant', text: 'use file_name_here and 2 * 3 * 4' }] });
    expect(bubble(c, 'a').textContent).toBe('use file_name_here and 2 * 3 * 4');
    expect(bubble(c, 'a').querySelector('em')).toBeNull();
  });

  it('sending from the composer adds a user message and emits one aui-send', async () => {
    const c = mount();
    const sends: ChatSendDetail[] = [];
    c.host.addEventListener('aui-send', (e) => sends.push((e as CustomEvent<ChatSendDetail>).detail));
    await userEvent.click(c.prompt!.textarea);
    await userEvent.keyboard('What is my leave balance?{Enter}');
    expect(sends).toEqual([{ text: 'What is my leave balance?', attachments: [] }]);
    expect(c.messages.map((m) => [m.role, m.text])).toEqual([['user', 'What is my leave balance?']]);
    expect(c.prompt!.value).toBe('');
  });

  it('a prevented aui-send keeps the text and adds nothing', async () => {
    const c = mount();
    c.host.addEventListener('aui-send', (e) => {
      e.preventDefault();
    });
    await userEvent.click(c.prompt!.textarea);
    await userEvent.keyboard('draft{Enter}');
    expect(c.messages).toHaveLength(0);
    expect(c.prompt!.value).toBe('draft');
  });

  it('streams an async iterable: typing dots, then text, then complete; the composer shows Stop meanwhile', async () => {
    const c = mount();
    const done = c.stream(chunks(['Hello ', 'world', '!']), { id: 'r1' });
    expect(c.streaming).toBe(true);
    expect(c.host.querySelector('.aui-chat__dots')).not.toBeNull();
    expect(c.prompt!.status).toBe('streaming');
    const final = await done;
    expect(final.text).toBe('Hello world!');
    expect(final.status).toBe('complete');
    expect(c.streaming).toBe(false);
    expect(c.prompt!.status).toBe('idle');
    expect(bubble(c, 'r1').textContent).toBe('Hello world!');
  });

  it('streams a ReadableStream', async () => {
    const c = mount();
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('From ');
        controller.enqueue('a stream');
        controller.close();
      },
    });
    const final = await c.stream(stream);
    expect(final.text).toBe('From a stream');
  });

  it('Stop aborts the signal, keeps the partial text, and offers Retry with the prompt', async () => {
    const c = mount({ messages: [{ id: 'q', role: 'user', text: 'Explain' }] });
    let aborted = false;
    const stops = vi.fn();
    c.host.addEventListener('aui-stop', stops);
    // The source holds back its last chunk until Stop, so the reply is still streaming when the
    // (slow, CDP-driven) click lands; a timed source could finish first and relabel the button Send.
    const done = c.stream((signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return (async function* (): AsyncGenerator<string> {
        yield* chunks(['part one ', 'part two ']);
        await new Promise((resolve) => {
          signal.addEventListener('abort', resolve, { once: true });
        });
        yield 'part three';
      })();
    }, { id: 'r' });
    await vi.waitFor(() => {
      expect(c.messages.find((m) => m.id === 'r')?.text).toContain('part one');
    });
    await userEvent.click(c.host.querySelector<HTMLButtonElement>('.aui-prompt-input__send')!);
    const final = await done;
    expect(aborted).toBe(true);
    expect(stops).toHaveBeenCalledWith(expect.objectContaining({ detail: { id: 'r' } }));
    expect(final.status).toBe('stopped');
    expect(final.text).not.toContain('part three');
    const retries: ChatRetryDetail[] = [];
    c.host.addEventListener('aui-retry', (e) => retries.push((e as CustomEvent<ChatRetryDetail>).detail));
    await userEvent.click(c.host.querySelector<HTMLButtonElement>('.aui-chat__retry')!);
    expect(retries[0]!.id).toBe('r');
    expect(retries[0]!.prompt?.text).toBe('Explain');
  });

  it('a failing source shows a generic error (never the thrown detail); Retry restarts the same message', async () => {
    const c = mount();
    const failed = await c.stream(chunks(['Partial'], { fail: true }), { id: 'r' });
    expect(failed.status).toBe('error');
    const article = c.host.querySelector('article[data-id="r"]')!;
    expect(article.querySelector('.aui-chat__error')!.textContent).toContain('Something went wrong');
    expect(article.textContent).not.toContain('secret server detail');
    const again = await c.stream(chunks(['Fixed']), { id: 'r' });
    expect(again.status).toBe('complete');
    expect(c.messages.filter((m) => m.id === 'r')).toHaveLength(1);
    expect(bubble(c, 'r').textContent).toBe('Fixed');
  });

  it('feedback buttons are exclusive toggles and report aui-feedback', async () => {
    const c = mount({ messages: [{ id: 'a', role: 'assistant', text: 'Answer' }] });
    const events: ChatFeedbackDetail[] = [];
    c.host.addEventListener('aui-feedback', (e) => events.push((e as CustomEvent<ChatFeedbackDetail>).detail));
    const up = c.host.querySelector<HTMLButtonElement>('.aui-chat__helpful')!;
    const down = c.host.querySelector<HTMLButtonElement>('.aui-chat__unhelpful')!;
    await userEvent.click(up);
    expect(up.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(down);
    expect(up.getAttribute('aria-pressed')).toBe('false');
    expect(down.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(down);
    expect(down.getAttribute('aria-pressed')).toBe('false');
    expect(events.map((e) => e.value)).toEqual(['up', 'down', null]);
    expect(c.messages[0]!.feedback).toBeNull();
  });

  it('suggestions send their text; a prevented aui-suggestion sends nothing; hidden while streaming', async () => {
    const c = mount({ suggestions: [{ id: 's', label: 'Leave balance', text: 'How many leave days do I have?' }] });
    const picked: ChatSuggestionDetail[] = [];
    c.host.addEventListener('aui-suggestion', (e) => picked.push((e as CustomEvent<ChatSuggestionDetail>).detail));
    await userEvent.click(c.host.querySelector<HTMLButtonElement>('.aui-chat__suggestion')!);
    expect(picked[0]!.suggestion.id).toBe('s');
    expect(c.messages.map((m) => m.text)).toEqual(['How many leave days do I have?']);
    const done = c.stream(chunks(['ok']));
    expect(c.host.querySelector<HTMLElement>('.aui-chat__suggestions')!.hidden).toBe(true);
    await done;
    expect(c.host.querySelector<HTMLElement>('.aui-chat__suggestions')!.hidden).toBe(false);
  });

  it('attachments render as chips that emit aui-attachment-open', async () => {
    const c = mount({ messages: [{ id: 'm', role: 'user', text: 'See attached', attachments: [{ id: 'f', name: 'policy.pdf', size: 2048 }] }] });
    const opened: ChatAttachmentOpenDetail[] = [];
    c.host.addEventListener('aui-attachment-open', (e) => opened.push((e as CustomEvent<ChatAttachmentOpenDetail>).detail));
    const chip = c.host.querySelector<HTMLButtonElement>('.aui-chat__attachment')!;
    expect(chip.getAttribute('aria-label')).toMatch(/^Open policy\.pdf, /);
    await userEvent.click(chip);
    expect(opened[0]).toEqual({ messageId: 'm', attachment: { id: 'f', name: 'policy.pdf', size: 2048 } });
  });

  it('auto-scroll follows new content until the user scrolls up; Jump to latest returns', async () => {
    // Unit tests load no component stylesheets; the log only scrolls with these rules of style.scss.
    const style = document.createElement('style');
    style.textContent = '.aui-chat{display:flex;flex-direction:column}.aui-chat__viewport{display:flex;flex:1 1 auto;flex-direction:column;min-block-size:0}.aui-chat__log{flex:1 1 auto;min-block-size:0;overflow-y:auto}';
    document.body.append(style);
    const many: ChatMessage[] = Array.from({ length: 40 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', text: `Message ${String(i)}` }));
    const c = mount({ messages: many });
    const log = c.host.querySelector<HTMLElement>('.aui-chat__log')!;
    expect(log.scrollHeight).toBeGreaterThan(log.clientHeight);
    const jump = c.host.querySelector<HTMLButtonElement>('.aui-chat__jump')!;
    expect(log.scrollTop + log.clientHeight).toBeGreaterThanOrEqual(log.scrollHeight - 2);
    expect(jump.hidden).toBe(true);
    log.scrollTop = 0;
    log.dispatchEvent(new Event('scroll'));
    expect(c.following).toBe(false);
    expect(jump.hidden).toBe(false);
    c.addMessage({ id: 'new', role: 'assistant', text: 'New' });
    expect(log.scrollTop).toBe(0);
    await userEvent.click(jump);
    expect(c.following).toBe(true);
    expect(log.scrollTop + log.clientHeight).toBeGreaterThanOrEqual(log.scrollHeight - 2);
    expect(document.activeElement).toBe(c.host.querySelector('article[data-id="new"]'));
  });

  it('caps the DOM at maxRenderedMessages with a button for earlier messages', async () => {
    const many: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({ id: String(i), role: 'user', text: `M${String(i)}` }));
    const c = mount({ messages: many, maxRenderedMessages: 20 });
    expect(articles(c)).toHaveLength(20);
    const earlier = c.host.querySelector<HTMLButtonElement>('.aui-chat__earlier')!;
    expect(earlier.textContent).toBe('Show earlier messages (30)');
    await userEvent.click(earlier);
    expect(articles(c)).toHaveLength(40);
    await userEvent.click(earlier);
    expect(articles(c)).toHaveLength(50);
    expect(earlier.hidden).toBe(true);
  });

  it('typing indicator and empty text', () => {
    const c = mount({ emptyText: 'Ask me anything.' });
    expect(c.host.querySelector('.aui-chat__empty')!.textContent).toBe('Ask me anything.');
    c.update({ typing: 'Grace' });
    expect(c.host.querySelector('.aui-chat__typing')!.textContent).toBe('Grace is typing');
  });

  it('global config and validation: invalid options throw before rendering', () => {
    configureAbsoluteUI({ components: { chat: { assistantFormat: 'text', showAvatars: false } } });
    const c = mount({ messages: [{ id: 'a', role: 'assistant', text: '**plain**' }] });
    expect(bubble(c, 'a').textContent).toBe('**plain**');
    expect(c.host.querySelector('.aui-chat__avatar')).toBeNull();
    const host = document.createElement('div');
    host.textContent = 'untouched';
    expect(() => Chat.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => Chat.create(host, { label: 'x', messages: [{ id: 'a', role: 'user', text: '' }, { id: 'a', role: 'user', text: '' }] })).toThrow(/Invalid chat options/);
    expect(() => Chat.create(host, { label: 'x', messages: [{ id: 'a', role: 'robot' as 'user', text: '' }] })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('untouched');
    expect(() => {
      c.update({ suggestions: [{ id: 's', label: '' }] });
    }).toThrow(AbsoluteUIError);
    expect(c.options.suggestions).toBeUndefined();
  });

  it('destroy aborts a running stream and removes everything', async () => {
    const c = mount();
    let aborted = false;
    const done = c.stream((signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return chunks(['a', 'b', 'c'], { delay: 50 });
    });
    c.destroy();
    const final = await done;
    expect(aborted).toBe(true);
    expect(final.status).toBe('stopped');
    expect(c.host.childElementCount).toBe(0);
    expect(c.host.classList.contains('aui-chat')).toBe(false);
  });
});
