import { CodeViewer, type CodeViewerOptions } from '@absoluteui/components/code-viewer';
import { host, seed } from '../seed.js';

export default seed<CodeViewerOptions>({
  options: {
    label: 'Leave request handler',
    filename: 'leave.ts',
    language: 'typescript',
    code: "import { submit } from './api.js';\n\n/** Request leave for a number of business days. */\nexport async function requestLeave(days: number): Promise<void> {\n  if (days <= 0) throw new Error('days must be positive');\n  await submit({ days });\n}\n",
    highlightLines: [4],
    maxHeight: '20rem',
  },
  call: 'CodeViewer.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = CodeViewer.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
