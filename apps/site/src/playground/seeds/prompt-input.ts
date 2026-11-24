import { PromptInput, type PromptInputOptions } from '@absoluteui/components/prompt-input';
import { host, seed } from '../seed.js';

const COMMANDS = [
  { insert: '/summarize', label: '/summarize', description: 'Summarize the conversation' },
  { insert: '/translate', label: '/translate', description: 'Translate the last reply' },
];

export default seed<PromptInputOptions>({
  options: { label: 'Message', placeholder: 'Ask a question, or type / for commands', attachments: true, showHint: true, maxLength: 500, showCounter: true },
  call: 'PromptInput.create(host, $)',
  codeValues: { triggers: "[{ char: '/', suggest: (query) => commands.filter((c) => c.label.slice(1).startsWith(query)) }]" },
  hide: ['triggers'],
  note: 'Type / to open the command suggestions; Enter sends.',
  mount(stage, options) {
    const h = host(stage);
    const c = PromptInput.create(h, { ...options, triggers: [{ char: '/', suggest: (query) => COMMANDS.filter((cmd) => cmd.label.slice(1).startsWith(query)) }] });
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
