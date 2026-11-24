import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Form } from '@absoluteui/components/form';
import {
  richTextFromHtml,
  richTextFromMarkdown,
  RichTextEditor,
  richTextToHtml,
  richTextToMarkdown,
  type RichTextEditorOptions,
  type RichTextEditorValueDetail,
} from '@absoluteui/components/rich-text-editor';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function editor(options: Partial<RichTextEditorOptions> = {}): RichTextEditor {
  const host = document.createElement('div');
  document.body.append(host);
  return RichTextEditor.create(host, { label: 'Notes', ...options });
}

const accept = (url: string): string | null => (/^(https?:|mailto:|\/)/.test(url) ? url : null);

async function type(ed: RichTextEditor, text: string): Promise<void> {
  ed.focus();
  await userEvent.keyboard(text);
}

describe('rich text: HTML I/O', () => {
  it('round-trips supported structure and escapes text', () => {
    const html = '<h2>Title</h2><p data-align="center">A <strong>bold</strong> <a href="https://example.com"><em>link</em></a> &amp; &lt;tag&gt;<br>next</p><ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><ol><li>first</li></ol><blockquote><p>q1</p><p>q2</p></blockquote><pre><code>let x = 1 &lt; 2;</code></pre>';
    const doc = richTextFromHtml(html);
    expect(doc.blocks.map((b) => [b.type, b.depth ?? null])).toEqual([['heading', null], ['paragraph', null], ['list', 0], ['list', 1], ['list', 0], ['list', 0], ['quote', null], ['quote', null], ['code', null]]);
    expect(richTextToHtml(doc)).toBe(html);
  });

  it('sanitizes: scripts, event handlers, styles, and javascript: URLs never survive', () => {
    const doc = richTextFromHtml('<p onclick="x()" style="color:red">Hi<script>alert(1)</script><img src=x onerror=alert(1)> <a href="javascript:alert(1)">bad</a></p>');
    const out = richTextToHtml(doc);
    expect(out).toBe('<p>Hi bad</p>');
  });

  it('maps b/i/strike/del, legacy align, and deeper headings to the supported set', () => {
    const doc = richTextFromHtml('<h5>deep</h5><p align="right"><b>b</b><i>i</i><del>d</del></p>', [1, 2, 3]);
    expect(richTextToHtml(doc)).toBe('<h3>deep</h3><p data-align="end"><strong>b</strong><em>i</em><s>d</s></p>');
  });
});

describe('rich text: Markdown I/O', () => {
  it('parses a CommonMark subset', () => {
    const md = '# Title\n\nSome **bold**, *italic*, ~~gone~~, `code`, <u>under</u> and [a link](https://x.test).\nsoft line\\\nhard line\n\n- one\n    - two\n- three\n\n1. a\n2. b\n\n> quoted\n\n```\ncode()\n```';
    const doc = richTextFromMarkdown(md, accept);
    expect(doc.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'list', 'list', 'list', 'quote', 'code']);
    const para = doc.blocks[1]!;
    const marks = Object.fromEntries(para.runs.map((r) => [r.text, [...r.marks, ...(r.link ? ['link'] : [])].join('+')]));
    expect(marks).toMatchObject({ bold: 'bold', italic: 'italic', gone: 'strike', code: 'code', under: 'underline', 'a link': 'link' });
    expect(para.runs.map((r) => r.text).join('')).toContain('. soft line');
    expect(para.runs.map((r) => r.text).join('')).toContain('line\nhard line');
    expect(doc.blocks[3]!.depth).toBe(1);
    expect(doc.blocks[5]!.list).toBe('ordered');
  });

  it('round-trips through toMarkdown and escapes literal delimiters', () => {
    const doc = richTextFromMarkdown('## Heading\n\nA **b** and *i* 2 * 3 \\*literal\\*\n\n- x\n    1. y\n\n> q', accept);
    const md = richTextToMarkdown(doc);
    expect(md).toBe('## Heading\n\nA **b** and *i* 2 \\* 3 \\*literal\\*\n\n- x\n    1. y\n\n> q');
    expect(richTextToHtml(richTextFromMarkdown(md, accept))).toBe(richTextToHtml(doc));
  });

  it('drops links the URL policy rejects (text kept)', () => {
    const doc = richTextFromMarkdown('[x](javascript:alert(1)) <javascript:alert(1)>', accept);
    expect(doc.blocks[0]!.runs.every((r) => r.link === undefined)).toBe(true);
  });
});

describe('RichTextEditor: structure and form contract', () => {
  it('is a labelled multiline textbox with a toolbar controlling it', () => {
    const ed = editor({ description: 'Markdown shortcuts work', placeholder: 'Write…', required: true });
    const box = ed.content;
    expect(box.getAttribute('role')).toBe('textbox');
    expect(box.getAttribute('aria-multiline')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)?.textContent).toContain('Notes');
    expect(box.getAttribute('aria-required')).toBe('true');
    expect(box.getAttribute('aria-placeholder')).toBe('Write…');
    const toolbar = ed.host.querySelector('[role="toolbar"]')!;
    expect(toolbar.getAttribute('aria-controls')).toBe(box.id);
    expect(toolbar.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
    expect(ed.validity.valid).toBe(false);
  });

  it('initial value in each format; value follows valueFormat', () => {
    expect(editor({ value: '<p>Hi <strong>there</strong></p>' }).getMarkdown()).toBe('Hi **there**');
    expect(editor({ value: '# T', valueFormat: 'markdown' }).getHTML()).toBe('<h1>T</h1>');
    expect(editor({ value: 'a\nb', mode: 'plain' }).value).toBe('a\nb');
    expect(editor().value).toBe('');
  });

  it('joins Form: serializes, validates maxLength, resets', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const host = document.createElement('div');
    form.append(host);
    const ed = RichTextEditor.create(host, { label: 'Body', name: 'body', value: '<p>abc</p>', maxLength: 2 });
    const f = Form.create(form);
    expect(f.getValues()).toMatchObject({ body: '<p>abc</p>' });
    expect(ed.validity.valid).toBe(false);
    ed.setHTML('<p>ab</p>');
    expect(ed.validity.valid).toBe(true);
    ed.reset();
    expect(ed.getHTML()).toBe('<p>abc</p>');
  });

  it('rejects invalid options without touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => RichTextEditor.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => RichTextEditor.create(host, { label: 'x', linkSchemes: ['javascript'] })).toThrow(/linkSchemes/);
    expect(host.textContent).toBe('keep');
  });
});

describe('RichTextEditor: editing through beforeinput', () => {
  it('typing, Enter, and Backspace edit the model; the DOM is re-rendered from it', async () => {
    const ed = editor();
    const inputs: string[] = [];
    ed.host.addEventListener('aui-input', (e) => inputs.push((e as CustomEvent<RichTextEditorValueDetail>).detail.value));
    await type(ed, 'Hello{Enter}World{Backspace}d');
    expect(ed.getHTML()).toBe('<p>Hello</p><p>World</p>');
    expect(ed.content.querySelectorAll('p')).toHaveLength(2);
    expect(inputs.at(-1)).toBe('<p>Hello</p><p>World</p>');
    await userEvent.keyboard('{Home}{Backspace}');
    expect(ed.getHTML()).toBe('<p>HelloWorld</p>');
  });

  it('Ctrl+B toggles bold for the next typed text; selection toggles existing text', async () => {
    const ed = editor();
    await type(ed, 'a{Control>}b{/Control}bold{Control>}b{/Control} plain');
    expect(ed.getHTML()).toBe('<p>a<strong>bold</strong> plain</p>');
    await userEvent.keyboard('{Shift>}{Home}{/Shift}{Control>}i{/Control}');
    expect(ed.getHTML()).toBe('<p><em>a</em><strong><em>bold</em></strong><em> plain</em></p>');
    expect(ed.formatState.marks).toContain('italic');
  });

  it('Markdown shortcuts: headings, lists, quotes, code blocks, and inline marks; undo reverts the conversion', async () => {
    const ed = editor();
    await type(ed, '## Title{Enter}- item{Enter}{Enter}> said{Enter}{Enter}**strong** and `x`');
    expect(ed.getHTML()).toBe('<h2>Title</h2><ul><li>item</li></ul><blockquote><p>said</p></blockquote><p><strong>strong</strong> and <code>x</code></p>');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(ed.getHTML()).toContain('and `x`');
  });

  it('Tab and Shift+Tab nest list items; Escape then Tab leaves the editor', async () => {
    const ed = editor();
    const after = document.createElement('button');
    after.textContent = 'after';
    document.body.append(after);
    await type(ed, '- a{Enter}b{Tab}');
    expect(ed.getHTML()).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(ed.getHTML()).toBe('<ul><li>a</li><li>b</li></ul>');
    await userEvent.keyboard('{Escape}{Tab}');
    expect(document.activeElement).toBe(after);
  });

  it('Enter in an empty list item leaves the list; Backspace at a heading start makes a paragraph', async () => {
    const ed = editor();
    await type(ed, '1. one{Enter}{Enter}text');
    expect(ed.getHTML()).toBe('<ol><li>one</li></ol><p>text</p>');
    ed.setHTML('<h1>Head</h1>');
    ed.focus();
    await userEvent.keyboard('{Backspace}');
    expect(ed.getHTML()).toBe('<p>Head</p>');
  });

  it('code block: Enter adds lines, Enter on an empty last line exits; marks do not apply', async () => {
    const ed = editor();
    await type(ed, '```{Enter}a{Enter}b{Enter}{Enter}after');
    expect(ed.getHTML()).toBe('<pre><code>a\nb</code></pre><p>after</p>');
  });

  it('undo and redo restore content (typing coalesces)', async () => {
    const ed = editor();
    await type(ed, 'abc');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(ed.getText()).toBe('');
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(ed.getText()).toBe('abc');
  });

  it('paste inserts sanitized HTML; plain mode pastes text only', () => {
    const ed = editor();
    ed.focus();
    const data = new DataTransfer();
    data.setData('text/html', '<p>x<b>y</b><script>bad()</script></p><ul><li>z</li></ul>');
    data.setData('text/plain', 'xy\nz');
    ed.content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(ed.getHTML()).toBe('<p>x<strong>y</strong></p><ul><li>z</li></ul>');
    const plain = editor({ mode: 'plain' });
    plain.focus();
    plain.content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(plain.value).toBe('xy\nz');
    expect(plain.host.querySelector('[role="toolbar"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('links: Ctrl+K opens the link editor; unsafe URLs are refused; valid ones apply', async () => {
    const ed = editor({ value: '<p>site</p>' });
    ed.focus();
    await userEvent.keyboard('{End}{Shift>}{Home}{/Shift}{Control>}k{/Control}');
    const input = ed.host.querySelector<HTMLInputElement>('.aui-rte__link-input')!;
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard(['java', 'script:alert(1)'].join('') + '{Enter}');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    await userEvent.clear(input);
    await userEvent.type(input, 'https://example.com{Enter}');
    expect(ed.getHTML()).toBe('<p><a href="https://example.com">site</a></p>');
    expect(document.activeElement).toBe(ed.content);
  });

  it('toolbar: pressed state follows the selection; buttons apply block types', async () => {
    const ed = editor({ value: '<p>text</p>' });
    ed.focus();
    await userEvent.click(ed.host.querySelector('[data-command="heading2"]')!);
    expect(ed.getHTML()).toBe('<h2>text</h2>');
    await expect.poll(() => ed.host.querySelector('[data-command="heading2"]')?.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(ed.host.querySelector('[data-command="alignCenter"]')!);
    expect(ed.getHTML()).toBe('<h2 data-align="center">text</h2>');
  });

  it('read-only content cannot be changed', async () => {
    const ed = editor({ value: '<p>fixed</p>', readOnly: true });
    await type(ed, 'x{Backspace}');
    expect(ed.getHTML()).toBe('<p>fixed</p>');
    expect(ed.content.getAttribute('aria-readonly')).toBe('true');
  });
});

describe('RichTextEditor: text boundaries and composition', () => {
  it('Backspace removes a whole emoji; Ctrl+Backspace removes a word', async () => {
    const ed = editor({ value: '<p>hello big world 👍🏽</p>' });
    ed.focus();
    await userEvent.keyboard('{End}{Backspace}');
    expect(ed.getText()).toBe('hello big world ');
    await userEvent.keyboard('{Control>}{Backspace}{/Control}');
    // Without the stylesheet (pre-wrap) the trailing space collapses, so the caret sits after the word.
    expect(ed.getText().trimEnd()).toBe('hello big');
  });

  it('IME composition: DOM text changed by the browser is reconciled into the model at compositionend', () => {
    const ed = editor({ value: '<p>ab</p>' });
    ed.focus();
    const text = ed.content.querySelector('p')!.firstChild as Text;
    ed.content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    // What an IME does while composing: the browser edits the text node directly.
    text.data = 'a日本b';
    const sel = document.getSelection()!;
    sel.collapse(text, 3);
    ed.content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本' }));
    expect(ed.getHTML()).toBe('<p>a日本b</p>');
    expect(ed.content.querySelector('p')!.textContent).toBe('a日本b');
  });
});
