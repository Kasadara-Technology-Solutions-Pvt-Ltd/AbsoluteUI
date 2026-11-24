import { RichTextEditor, type RichTextEditorOptions } from '@absoluteui/components/rich-text-editor';
import { host, seed } from '../seed.js';

export default seed<RichTextEditorOptions>({
  options: {
    label: 'Job description',
    value: '<h2>Payroll Specialist</h2><p>Join our <strong>People Operations</strong> team in Berlin.</p><ul><li>Run the monthly payroll for 400 employees</li><li>Reconcile benefits and tax filings</li></ul>',
    valueFormat: 'html',
    name: 'jobDescription',
    placeholder: 'Describe the role',
    description: 'Shown on the careers page. Markdown shortcuts such as ## and - work while typing.',
    required: true,
    maxLength: 2000,
    showCounter: true,
    toolbar: ['heading2', 'heading3', '|', 'bold', 'italic', 'link', '|', 'bulletList', 'orderedList', 'quote', '|', 'undo', 'redo'],
    headings: [2, 3],
  },
  call: 'RichTextEditor.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = RichTextEditor.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
