import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { CodeViewer, diffLines, diffStats, splitLines, tokenize, tokenizeLines, type CodeViewerChangeDetail, type CodeViewerCopyDetail, type CodeViewerOptions } from '@absoluteui/components/code-viewer';

afterEach(() => {
  resetAbsoluteUIConfig();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function mount(options: Partial<CodeViewerOptions> = {}): CodeViewer {
  const host = document.createElement('div');
  document.body.append(host);
  return CodeViewer.create(host, { label: 'Example', code: 'const a = 1;\nconst b = "x";\n', language: 'typescript', ...options });
}

const types = (code: string, language: Parameters<typeof tokenize>[1]): string[] => tokenize(code, language).filter((t) => t.type !== null).map((t) => `${t.type ?? ''}:${t.text}`);

describe('tokenizer', () => {
  it('TypeScript: keywords, types, strings with escapes, template literals, comments, numbers, calls', () => {
    const t = types("const x: string = 'a\\'b'; // note\nfoo(0x1F, `t\n${y}`); /* block\ncomment */ class Leave {}", 'typescript');
    expect(t).toContain('keyword:const');
    expect(t).toContain('type:string');
    expect(t).toContain("string:'a\\'b'");
    expect(t).toContain('comment:// note');
    expect(t).toContain('function:foo');
    expect(t).toContain('number:0x1F');
    expect(t).toContain('string:`t\n${y}`');
    expect(t).toContain('comment:/* block\ncomment */');
    expect(t).toContain('type:Leave');
  });

  it('JSON keys, values, and literals; CSS selectors, properties, and values', () => {
    expect(types('{"a": 1, "b": [true, null, "s"]}', 'json')).toEqual(['punctuation:{', 'attr:"a"', 'punctuation::', 'number:1', 'punctuation:,', 'attr:"b"', 'punctuation::', 'punctuation:[', 'keyword:true', 'punctuation:,', 'keyword:null', 'punctuation:,', 'string:"s"', 'punctuation:]}']);
    const css = types('a:hover, .b { color: #fff; margin: 0 4px; } @media print {}', 'css');
    expect(css).toContain('tag:a:hover');
    expect(css).toContain('tag:.b');
    expect(css).toContain('attr:color');
    expect(css).toContain('number:#fff');
    expect(css).toContain('number:4px');
    expect(css).toContain('keyword:@media');
  });

  it('HTML tags, attributes, values, comments, and entities; SQL; Bash; Markdown', () => {
    const html = types('<!-- c --><a href="/x" hidden>Hi &amp; bye</a>', 'html');
    expect(html).toEqual(['comment:<!-- c -->', 'punctuation:<', 'tag:a', 'attr:href', 'punctuation:=', 'string:"/x"', 'attr:hidden', 'punctuation:>', 'number:&amp;', 'punctuation:</', 'tag:a', 'punctuation:>']);
    const sql = types("SELECT count(*) FROM t WHERE a = 'it''s' AND b = $1 -- c", 'sql');
    expect(sql).toContain('keyword:SELECT');
    expect(sql).toContain('function:count');
    expect(sql).toContain("string:'it''s'");
    expect(sql).toContain('variable:$1');
    expect(sql).toContain('comment:-- c');
    const bash = types('# setup\nexport A="$B" && ls -la ${HOME}', 'bash');
    expect(bash).toContain('comment:# setup');
    expect(bash).toContain('keyword:export');
    expect(bash).toContain('attr:-la');
    expect(bash).toContain('variable:${HOME}');
    const md = types('# Title\nSome *em*, **strong**, `code`, and [link](u)\n- item\n```js\nx\n```', 'markdown');
    expect(md).toEqual(['heading:# Title', 'emphasis:*em*', 'emphasis:**strong**', 'code:`code`', 'link:[link](u)', 'punctuation:-', 'code:```js\nx\n```']);
  });

  it('tokenizeLines splits multi-line tokens; splitLines ignores one trailing newline; plain is one token', () => {
    const lines = tokenizeLines('/* a\nb */ x\n', 'javascript');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([{ type: 'comment', text: '/* a' }]);
    expect(lines[1]?.[0]).toEqual({ type: 'comment', text: 'b */' });
    expect(splitLines('a\r\nb\n')).toEqual(['a', 'b']);
    expect(tokenize('<b>', 'plain')).toEqual([{ type: null, text: '<b>' }]);
    expect(tokenizeLines('', 'typescript')).toEqual([[]]);
  });
});

describe('diffLines', () => {
  it('finds a minimal edit script with line numbers', () => {
    const d = diffLines('a\nb\nc\nd\n', 'a\nx\nc\nd\ne\n');
    expect(d.map((l) => `${l.op[0] ?? ''}${String(l.originalLine ?? '-')}/${String(l.modifiedLine ?? '-')}:${l.text}`)).toEqual(['e1/1:a', 'd2/-:b', 'i-/2:x', 'e3/3:c', 'e4/4:d', 'i-/5:e']);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });

  it('handles empty sides, the edit cap, and whitespace-insensitive comparison', () => {
    expect(diffLines('', 'a\nb').map((l) => l.op)).toEqual(['insert', 'insert']);
    expect(diffLines('a', '').map((l) => l.op)).toEqual(['delete']);
    expect(diffLines('a\nb\nc', 'c\nb\na', { maxEdits: 0 }).map((l) => l.op)).toEqual(['delete', 'delete', 'delete', 'insert', 'insert', 'insert']);
    expect(diffLines('  a\nb', 'a\nb', { ignoreWhitespace: true }).every((l) => l.op === 'equal')).toBe(true);
  });

  it('diffs two 10,000-line texts quickly', () => {
    const a = Array.from({ length: 10_000 }, (_, i) => `line ${String(i)}`).join('\n');
    const b = a.replace('line 5000', 'changed').replace('line 9000\n', '');
    const start = performance.now();
    const d = diffLines(a, b);
    expect(performance.now() - start).toBeLessThan(200);
    expect(d.filter((l) => l.op !== 'equal')).toHaveLength(3);
  });
});

describe('CodeViewer', () => {
  it('renders a named, focusable region with line numbers and token spans (text nodes only)', () => {
    const v = mount({ filename: 'a.ts' });
    const region = v.host.querySelector<HTMLElement>('[role="region"]')!;
    expect(region.getAttribute('aria-label')).toBe('Example');
    expect(region.tabIndex).toBe(0);
    expect(document.getElementById(region.getAttribute('aria-describedby')!)!.textContent).toBe('2 lines, TypeScript');
    const rows = v.host.querySelectorAll('.aui-code-viewer__line');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector('.aui-code-viewer__num')!.getAttribute('aria-hidden')).toBe('true');
    expect(rows[0]!.querySelector('.aui-code-viewer__t--keyword')!.textContent).toBe('const');
    expect(v.host.querySelector('.aui-code-viewer__filename')!.textContent).toBe('a.ts');
    expect(v.host.querySelector('.aui-code-viewer__canvas')!.getAttribute('dir')).toBe('ltr');
  });

  it('never parses code as HTML', () => {
    const v = mount({ code: '<img src=x onerror=alert(1)>', language: 'html' });
    expect(v.host.querySelector('img')).toBeNull();
    expect(v.host.querySelector('.aui-code-viewer__code')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('highlights lines with a visually hidden prefix; startLine shifts numbers', () => {
    const v = mount({ code: 'a\nb\nc\nd', language: 'plain', startLine: 10, highlightLines: [11, [12, 13]] });
    const rows = [...v.host.querySelectorAll('.aui-code-viewer__line')];
    expect(rows.map((r) => r.querySelector('.aui-code-viewer__num')!.textContent)).toEqual(['10', '11', '12', '13']);
    expect(rows.map((r) => r.classList.contains('aui-code-viewer__line--highlight'))).toEqual([false, true, true, true]);
    expect(rows[1]!.querySelector('.aui-visually-hidden')!.textContent).toBe('Highlighted: ');
  });

  it('unified diff marks added and removed lines with text, not color only', () => {
    const v = mount({ language: 'plain', diff: { original: 'a\nb', modified: 'a\nc' } });
    const rows = [...v.host.querySelectorAll('.aui-code-viewer__line')];
    expect(rows).toHaveLength(3);
    expect(rows[1]!.classList.contains('aui-code-viewer__line--delete')).toBe(true);
    expect(rows[1]!.querySelector('.aui-visually-hidden')!.textContent).toBe('Removed: ');
    expect(rows[2]!.querySelector('.aui-visually-hidden')!.textContent).toBe('Added: ');
    expect(v.host.querySelector('.aui-code-viewer__stats')!.textContent).toBe('1 added, 1 removed');
    expect(v.mode).toBe('unified');
    expect(v.text).toBe('a\nc');
  });

  it('switches to side by side with the toolbar and emits aui-change once', async () => {
    const v = mount({ language: 'plain', diff: { original: 'a\nb', modified: 'a\nc' } });
    const details: CodeViewerChangeDetail[] = [];
    v.host.addEventListener('aui-change', (e) => details.push((e as CustomEvent<CodeViewerChangeDetail>).detail));
    const split = [...v.host.querySelectorAll('button')].find((b) => b.textContent.includes('Side by side'))!;
    await userEvent.click(split);
    expect(details).toEqual([{ wrap: false, mode: 'split', reason: 'mode' }]);
    expect(v.host.classList.contains('aui-code-viewer--split')).toBe(true);
    expect(v.host.querySelectorAll('.aui-code-viewer__row--split')).toHaveLength(2);
    expect(split.getAttribute('aria-pressed')).toBe('true');
  });

  it('wrap toggle and configuration', async () => {
    configureAbsoluteUI({ components: { codeViewer: { lineNumbers: false, tabSize: 4 } } });
    const v = mount();
    expect(v.host.querySelector('.aui-code-viewer__num')).toBeNull();
    expect(v.host.style.getPropertyValue('--_aui-code-viewer-tab')).toBe('4');
    const changes: CodeViewerChangeDetail[] = [];
    v.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<CodeViewerChangeDetail>).detail));
    const wrap = [...v.host.querySelectorAll('button')].find((b) => b.textContent.includes('Wrap'))!;
    await userEvent.click(wrap);
    expect(v.wrap).toBe(true);
    expect(v.host.classList.contains('aui-code-viewer--wrap')).toBe(true);
    expect(changes).toEqual([{ wrap: true, mode: null, reason: 'wrap' }]);
  });

  it('copy writes the text, announces, and emits aui-copy', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const v = mount();
    const copied: string[] = [];
    v.host.addEventListener('aui-copy', (e) => copied.push((e as CustomEvent<CodeViewerCopyDetail>).detail.text));
    expect(await v.copy()).toBe(true);
    expect(write).toHaveBeenCalledWith('const a = 1;\nconst b = "x";\n');
    expect(copied).toHaveLength(1);
    write.mockRejectedValue(new Error('denied'));
    expect(await v.copy()).toBe(false);
    expect(copied).toHaveLength(1);
  });

  it('virtualizes large files and scrolls to a line', async () => {
    // Unit tests do not load the stylesheets: give the virtual viewport the layout rules its CSS would
    // (style.scss), or it never overflows and scrollTop stays 0.
    const style = document.createElement('style');
    style.textContent = `
.aui-code-viewer--virtual .aui-code-viewer__viewport { position: relative; overflow: auto; block-size: var(--_aui-code-viewer-max-height, 30rem); }
.aui-code-viewer--virtual .aui-code-viewer__canvas { position: relative; block-size: var(--_aui-code-viewer-total, auto); }
.aui-code-viewer__row--abs { position: absolute; inset-block-start: var(--_aui-code-viewer-y, 0); inset-inline: 0; }
`;
    document.head.append(style);
    onTestFinished(() => {
      style.remove();
    });
    const code = Array.from({ length: 10_000 }, (_, i) => `const v${String(i)} = ${String(i)};`).join('\n');
    const start = performance.now();
    const v = mount({ code, maxHeight: '20rem' });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(v.rowCount).toBe(10_000);
    expect(v.host.classList.contains('aui-code-viewer--virtual')).toBe(true);
    expect(v.renderedRowCount).toBeLessThan(200);
    v.scrollToLine(5000);
    await new Promise((r) => requestAnimationFrame(r));
    const nums = [...v.host.querySelectorAll('.aui-code-viewer__num')].map((n) => Number(n.textContent));
    expect(nums).toContain(5000);
  });

  it('toolbar options, update, and destroy', () => {
    const v = mount({ toolbar: false });
    expect(v.host.querySelector<HTMLElement>('.aui-code-viewer__toolbar')!.hidden).toBe(true);
    v.update({ toolbar: true, copyable: false, wrapToggle: false, code: 'x' });
    expect(v.host.querySelector<HTMLElement>('.aui-code-viewer__toolbar')!.hidden).toBe(false);
    expect(v.rowCount).toBe(1);
    v.destroy();
    expect(v.host.childElementCount).toBe(0);
    expect(v.host.classList.contains('aui-code-viewer')).toBe(false);
  });

  it('validates options before touching the host; invalid update keeps state', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => CodeViewer.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    // @ts-expect-error invalid language
    expect(() => CodeViewer.create(host, { label: 'x', language: 'cobol' })).toThrow(/CODE_VIEWER_OPTIONS|Invalid code viewer/);
    expect(() => CodeViewer.create(host, { label: 'x', maxHeight: 'calc(1px)' })).toThrow(AbsoluteUIError);
    expect(() => CodeViewer.create(host, { label: 'x', highlightLines: [[3, 1]] })).toThrow(AbsoluteUIError);
    const v = mount();
    expect(() => {
      v.update({ startLine: -1 });
    }).toThrow(AbsoluteUIError);
    expect(v.options.startLine).toBeUndefined();
  });
});
