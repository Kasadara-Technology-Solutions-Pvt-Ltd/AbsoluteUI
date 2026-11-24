// R20 P5 page: Chat and Prompt Input (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI, instant, plainDate } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { Chat, type ChatFeedbackDetail, type ChatRetryDetail, type ChatSendDetail } from '@absoluteui/components/chat';
import { Stack } from '@absoluteui/components/layout';
import { PromptInput, type PromptInputSendDetail } from '@absoluteui/components/prompt-input';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'UTC' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });
for (const el of document.querySelectorAll<HTMLElement>('.r20-chat')) el.style.setProperty('block-size', el.classList.contains('r20-chat--short') ? '18rem' : '30rem');

const sleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
});

/** Word-by-word reply; `?fail=1` makes the first reply fail after a few words. */
let failNext = params.get('fail') === '1';
async function* reply(text: string, signal: AbortSignal): AsyncGenerator<string> {
  const fail = failNext;
  failNext = false;
  const words = text.split(' ');
  for (const [i, word] of words.entries()) {
    await sleep(Number(params.get('delay') ?? '20'), signal);
    if (signal.aborted) return;
    if (fail && i === 3) throw new Error('simulated outage');
    yield `${word} `;
  }
}

const ANSWER = 'You have **12 days** of annual leave left this year.\n\n- Carry over: up to 5 days\n- Request leave under *Time off*\n\n```text\nPolicy HR-12\n```';
const status = byId('chat-log');
const chatHost = byId('chat');
const chat = Chat.create(chatHost, {
  label: 'Conversation with the HR assistant',
  today: plainDate(2026, 11, 20),
  businessCalendar: createBusinessCalendar({ holidays: [{ date: plainDate(2026, 11, 19), name: 'Founders Day' }] }),
  suggestions: [{ id: 'leave', label: 'How much leave do I have?' }, { id: 'payslip', label: 'Where is my payslip?' }],
  prompt: { attachments: true, accept: ['.pdf', '.txt', 'image/*'], placeholder: 'Ask the HR assistant', showHint: true },
  messages: [
    { id: 'm1', role: 'user', text: 'Hello', timestamp: instant(Date.UTC(2026, 10, 19, 9, 0)) },
    { id: 'm2', role: 'assistant', text: 'Hi! Ask me about **leave**, payslips, or policies. See [the handbook](https://example.com/handbook).', timestamp: instant(Date.UTC(2026, 10, 19, 9, 1)) },
    { id: 'm3', role: 'user', text: 'Here is my certificate.', timestamp: instant(Date.UTC(2026, 10, 20, 8, 0)), attachments: [{ id: 'f1', name: 'certificate.pdf', size: 52_000 }] },
  ],
});
const ask = (id?: string): void => {
  void chat.stream((signal) => reply(ANSWER, signal), id === undefined ? {} : { id });
};
chatHost.addEventListener('aui-send', (e) => {
  status.textContent = `send: ${(e as CustomEvent<ChatSendDetail>).detail.text}`;
  ask();
});
chatHost.addEventListener('aui-retry', (e) => {
  status.textContent = 'retry';
  ask((e as CustomEvent<ChatRetryDetail>).detail.id);
});
chatHost.addEventListener('aui-feedback', (e) => {
  status.textContent = `feedback: ${String((e as CustomEvent<ChatFeedbackDetail>).detail.value)}`;
});
chatHost.addEventListener('aui-stop', () => {
  status.textContent = 'stop';
});
chatHost.addEventListener('aui-attachment-open', () => {
  status.textContent = 'attachment-open';
});

Chat.create(byId('transcript'), {
  label: 'Support transcript',
  composer: false,
  authors: { assistant: { name: 'Grace Hopper' } },
  assistantFormat: 'text',
  feedback: false,
  typing: 'Grace Hopper',
  today: plainDate(2026, 11, 20),
  messages: Array.from({ length: 30 }, (_, i) => ({
    id: `t${String(i)}`,
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    text: i % 2 === 0 ? `Question ${String(i / 2 + 1)} about the onboarding checklist.` : `Answer ${String((i + 1) / 2)}: see the checklist.`,
    timestamp: instant(Date.UTC(2026, 10, 20, 9, i)),
  })),
});

const promptHost = byId('prompt');
PromptInput.create(promptHost, {
  label: 'Note to the team',
  description: 'Type / for commands or @ to mention someone.',
  maxLength: 200,
  showCounter: true,
  attachments: true,
  triggers: [
    { char: '/', suggest: (q) => [{ insert: '/summarize', label: '/summarize', description: 'Summarize the thread' }, { insert: '/remind', label: '/remind', description: 'Set a reminder' }].filter((s) => s.label.slice(1).startsWith(q)) },
    { char: '@', suggest: (q) => ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'].filter((n) => n.toLowerCase().includes(q.toLowerCase())).map((n) => ({ insert: `@${n}`, label: n })) },
  ],
});
promptHost.addEventListener('aui-send', (e) => {
  byId('prompt-log').textContent = (e as CustomEvent<PromptInputSendDetail>).detail.text;
});

Object.assign(window, { __auiReady: true });
