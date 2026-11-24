import { Chat, type ChatOptions } from '@absoluteui/components/chat';
import { host, seed } from '../seed.js';

/** A canned reply, word by word, that stops when the signal aborts. */
async function* reply(text: string, signal: AbortSignal): AsyncGenerator<string> {
  for (const word of text.split(' ')) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 70);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    if (signal.aborted) return;
    yield `${word} `;
  }
}

export default seed<ChatOptions>({
  options: {
    label: 'Conversation with the assistant',
    messages: [
      { id: 'm1', role: 'user', text: 'What can you help me with?' },
      { id: 'm2', role: 'assistant', text: 'I can answer questions about **leave**, payslips, and policies:\n\n- Leave balances\n- Public holidays\n- Expense rules' },
    ],
    suggestions: [{ id: 's1', label: 'How much leave do I have?' }, { id: 's2', label: 'When is the next holiday?' }],
  },
  call: 'Chat.create(host, $)',
  note: 'Send a message or pick a suggestion to see a streamed reply; press Stop to stop it.',
  mount(stage, options) {
    const h = host(stage);
    h.style.setProperty('block-size', '28rem');
    const c = Chat.create(h, options);
    const answer = (): void => {
      void c.stream((signal) => reply('Here is a **simulated** answer, streamed word by word. In your app, pass the text stream from your model or server.', signal));
    };
    h.addEventListener('aui-send', answer);
    h.addEventListener('aui-retry', (e) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      void c.stream((signal) => reply('A new attempt at the answer.', signal), { id });
    });
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
