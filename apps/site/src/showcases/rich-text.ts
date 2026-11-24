// Rich text showcase: an announcement editor with the full toolbar, Markdown
// shortcuts, a character limit, rich and plain modes, and the sanitized HTML and Markdown
// output shown as text beside it.
import { RichTextEditor, type RichTextToolbarItem } from '@absoluteui/components/rich-text-editor';
import { choice, createShowcase, hostIn, section, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Announcement editor',
  description: 'Type, use the toolbar or Markdown shortcuts (# heading, - list, **bold**), paste formatted text, and see the sanitized output.',
});

const FULL: readonly RichTextToolbarItem[] = ['paragraph', 'heading2', 'heading3', '|', 'bold', 'italic', 'underline', 'strike', 'code', 'link', '|', 'bulletList', 'orderedList', 'quote', 'codeBlock'];
const COMPACT: readonly RichTextToolbarItem[] = ['bold', 'italic', 'link', '|', 'bulletList'];

const editorSection = section(sc, 'Editor');
const editor = RichTextEditor.create(hostIn(editorSection), {
  label: 'Announcement',
  name: 'announcement',
  toolbar: FULL,
  headings: [2, 3],
  maxLength: 2000,
  showCounter: true,
  rows: 8,
  maxRows: 20,
  required: true,
  placeholder: 'Write the announcement',
  value: '<h2>Office move</h2><p>We move to the <strong>new building</strong> on <em>Monday</em>.</p><ul><li>Desks are assigned by team.</li><li>Parking passes arrive by email.</li></ul><p>Questions? See the <a href="https://example.com/move">move guide</a>.</p>',
});

const outputs = section(sc, 'Output');
outputs.classList.add('sc-outputs');
const pane = (title: string): HTMLPreElement => {
  const fig = document.createElement('figure');
  fig.className = 'sc-output';
  const cap = document.createElement('figcaption');
  cap.textContent = title;
  const pre = document.createElement('pre');
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', title);
  fig.append(cap, pre);
  outputs.append(fig);
  return pre;
};
const html = pane('Sanitized HTML');
const markdown = pane('Markdown');
const render = (): void => {
  // textContent only: the output is shown as code, never parsed.
  html.textContent = editor.getHTML();
  markdown.textContent = editor.getMarkdown();
};
render();
editor.host.addEventListener('aui-input', render);
sc.listen(editor.host, ['aui-change'], 'editor');

choice(
  sc,
  'Mode',
  [
    { value: 'rich', label: 'Rich text' },
    { value: 'plain', label: 'Plain text' },
  ],
  'rich',
  (mode) => {
    editor.update({ mode });
    render();
  },
);
choice(
  sc,
  'Toolbar',
  [
    { value: 'full', label: 'Full' },
    { value: 'compact', label: 'Compact' },
  ],
  'full',
  (t) => {
    editor.update({ toolbar: t === 'full' ? FULL : COMPACT });
  },
);
toggle(sc, 'Read-only', false, (readOnly) => {
  editor.update({ readOnly });
});
toggle(sc, 'Disabled', false, (disabled) => {
  editor.update({ disabled });
});
toggle(sc, 'Markdown shortcuts', true, (markdownShortcuts) => {
  editor.update({ markdownShortcuts });
});
