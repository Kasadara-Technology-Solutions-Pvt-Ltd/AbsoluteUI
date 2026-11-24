// Assistant showcase: an HR assistant answering from a simulated streaming server (word by word,
// with realistic delays, abortable by Stop), suggestion chips, a reply that fails on purpose and
// recovers with Retry, feedback and attachment events in the log, and a composer with attachments
// and slash commands. Every answer is canned text; nothing leaves the page.
import { instant, plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { Chat, type ChatRetryDetail, type ChatSendDetail } from '@absoluteui/components/chat';
import type { PromptSuggestion } from '@absoluteui/components/prompt-input';
import { action, annotate, choice, createShowcase, hostIn, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Assistant',
  description: 'Ask the HR assistant a question or pick a suggestion: the answer streams in word by word. Press Stop to stop it, rate replies, attach files, or type / for commands.',
  simulated: true,
});

const ANSWERS: readonly { readonly match: RegExp; readonly text: string }[] = [
  {
    match: /leave|holiday|vacation|time off/i,
    text: 'You have **14 days** of annual leave left this year.\n\n- **Carry over:** up to 5 days into next year\n- **Next public holiday:** see the team calendar\n\nTo request leave, open *Time off* and choose **New request**.',
  },
  {
    match: /payslip|salary|pay/i,
    text: 'Payslips are published on the **last working day** of each month.\n\n1. Open *My pay*\n2. Choose the month\n3. Download the PDF\n\nQuestions about deductions go to [the payroll team](https://example.com/payroll).',
  },
  {
    match: /expense|receipt/i,
    text: 'Submit expenses within **30 days**. Attach the receipt and pick a category:\n\n```text\nTravel      up to 250 EUR per night\nMeals       up to 45 EUR per day\nEquipment   needs manager approval\n```',
  },
];
const FALLBACK = 'I can help with **leave**, **payslips**, and **expenses**. Try asking "How much leave do I have?".';

let failNext = false;
let wordDelay = 70;

/** The simulated streaming server: words with jittered delays; Stop aborts the wait. */
async function* answer(question: string, signal: AbortSignal): AsyncGenerator<string> {
  await wait(450, signal).catch(() => undefined);
  const text = ANSWERS.find((a) => a.match.test(question))?.text ?? FALLBACK;
  const fail = failNext;
  failNext = false;
  const words = text.split(/(?<= )/);
  for (const [i, word] of words.entries()) {
    if (signal.aborted) return;
    if (fail && i === 6) throw new Error('503 Service Unavailable');
    try {
      await wait(wordDelay * (0.5 + Math.random()), signal);
    } catch {
      return;
    }
    yield word;
  }
}

const COMMANDS: readonly PromptSuggestion[] = [
  { insert: '/leave', label: '/leave', description: 'Ask about your leave balance' },
  { insert: '/payslip', label: '/payslip', description: 'Find your latest payslip' },
  { insert: '/expenses', label: '/expenses', description: 'Expense rules and limits' },
];

// Chat includes its prompt input.
const host = annotate(hostIn(sc.stage), ['chat', 'prompt-input']);
host.style.setProperty('block-size', '34rem');
const now = Date.now();
const chat = Chat.create(host, {
  label: 'Conversation with the HR assistant',
  authors: { assistant: { name: 'HR assistant' } },
  businessCalendar: createBusinessCalendar({ holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }, { date: plainDate(2026, 1, 1), name: 'New Year', yearly: true }] }),
  suggestions: [
    { id: 'leave', label: 'How much leave do I have?' },
    { id: 'payslip', label: 'Where is my payslip?' },
    { id: 'expenses', label: 'What are the expense limits?' },
  ],
  prompt: {
    placeholder: 'Ask the HR assistant',
    attachments: true,
    accept: ['.pdf', '.png', '.jpg', '.txt'],
    maxFileSize: 5 * 1024 * 1024,
    showHint: true,
    triggers: [{ char: '/', suggest: (query) => COMMANDS.filter((c) => c.label.slice(1).startsWith(query)) }],
  },
  messages: [
    { id: 'w1', role: 'system', text: 'Conversation started' },
    { id: 'w2', role: 'assistant', text: 'Hello! I answer questions about **leave**, **payslips**, and **expenses**. What would you like to know?', timestamp: instant(now - 60_000) },
  ],
});
sc.listen(host, ['aui-send', 'aui-stop', 'aui-retry', 'aui-feedback', 'aui-suggestion', 'aui-attachment-open'], 'chat');

host.addEventListener('aui-send', (e) => {
  const { text } = (e as CustomEvent<ChatSendDetail>).detail;
  void chat.stream((signal) => answer(text, signal), { errorMessage: 'The assistant is unavailable right now. Try again.' });
});
host.addEventListener('aui-retry', (e) => {
  const { id, prompt } = (e as CustomEvent<ChatRetryDetail>).detail;
  void chat.stream((signal) => answer(prompt?.text ?? '', signal), { id, errorMessage: 'The assistant is unavailable right now. Try again.' });
});

action(sc, 'Fail the next reply', () => {
  failNext = true;
  sc.log('server', 'the next reply fails after a few words');
}, ['chat']);
action(sc, 'Colleague typing', () => {
  chat.update({ typing: chat.options.typing ? null : 'Grace Hopper' });
}, ['chat']);
choice(
  sc,
  'Reply speed',
  [
    { value: 'normal', label: 'Normal' },
    { value: 'slow', label: 'Slow' },
    { value: 'fast', label: 'Fast' },
  ],
  'normal',
  (speed) => {
    wordDelay = speed === 'slow' ? 220 : speed === 'fast' ? 20 : 70;
  },
  ['chat'],
);
choice(
  sc,
  'Reply format',
  [
    { value: 'markdown', label: 'Markdown' },
    { value: 'text', label: 'Plain text' },
  ],
  'markdown',
  (assistantFormat) => {
    chat.update({ assistantFormat });
  },
  ['chat'],
);
toggle(sc, 'Avatars', true, (showAvatars) => {
  chat.update({ showAvatars });
}, ['chat']);
toggle(sc, 'Timestamps', true, (showTimestamps) => {
  chat.update({ showTimestamps });
}, ['chat']);
toggle(sc, 'Send with Ctrl+Enter', false, (on) => {
  chat.update({ prompt: { ...chat.options.prompt, submitKey: on ? 'mod-enter' : 'enter' } });
}, ['chat', 'prompt-input']);
action(sc, 'Clear conversation', () => {
  chat.clear();
}, ['chat']);
