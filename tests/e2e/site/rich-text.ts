// R3 rich text page (SPEC section 18.21), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { RichTextEditor } from '@absoluteui/components/rich-text-editor';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', locale: 'en-US', direction });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const editor = RichTextEditor.create(byId('editor'), {
  label: 'Release notes',
  name: 'notes',
  description: 'Markdown shortcuts work: # heading, - list, **bold**.',
  placeholder: 'Describe the release',
  required: true,
  maxLength: 2000,
  showCounter: true,
  value: '<h2>Highlights</h2><p>Faster <strong>exports</strong> and a new <a href="https://example.com/changelog">changelog</a>.</p><ul><li>Dashboard layouts</li><li>Rich text</li></ul>',
});
const plain = RichTextEditor.create(byId('plain'), { label: 'Summary (plain text)', mode: 'plain', rows: 3 });

const output = byId('output');
byId('show-html').addEventListener('click', () => {
  output.textContent = editor.getHTML();
});
byId('show-md').addEventListener('click', () => {
  output.textContent = editor.getMarkdown();
});
const last = byId('last-event');
editor.host.addEventListener('aui-change', () => {
  last.textContent = 'change';
});
byId('form').addEventListener('submit', (e) => {
  e.preventDefault();
  last.textContent = editor.reportValidity() ? 'submitted' : 'invalid';
});

Object.assign(window, { __auiReady: true, __aui: { RichTextEditor, editor, plain } });
