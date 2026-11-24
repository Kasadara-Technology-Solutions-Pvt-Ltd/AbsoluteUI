/**
 * Code Viewer (R20 P10). Read-only code display: line numbers, syntax highlighting for a fixed
 * set of languages (an in-repo tokenizer that yields text nodes with classes, never HTML),
 * highlighted lines, a wrap toggle, a copy button, and a diff view (unified or side by side)
 * computed in the repo with Myers' algorithm. Large files are virtualized on the shared
 * windowing engine. The code is a focusable, named region (role=region), so keyboard users
 * scroll it with the arrow, Page, Home, and End keys; diff lines carry visually hidden
 * "Added" and "Removed" prefixes, so the change is never conveyed by color alone.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, validators, type Density } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { checkIcon } from '@absoluteui/icons/set/check';
import { copyIcon } from '@absoluteui/icons/set/copy';
import { layoutColumnsIcon } from '@absoluteui/icons/set/layout-columns';
import { layoutListIcon } from '@absoluteui/icons/set/layout-list';
import { announce, observeResize } from '@absoluteui/utilities';
import { Button } from '../button/button.js';
import { Windowing } from '../internal/windowing.js';
import { diffLines, diffStats, type DiffLine, type DiffOp } from './diff.js';
import { CODE_LANGUAGES, tokenizeLines, type CodeLanguage, type CodeToken } from './tokenize.js';

export interface CodeViewerConfig {
  /** Show line numbers. */
  lineNumbers: boolean;
  /** Wrap long lines (code view and unified diff; the side-by-side diff always wraps). */
  wrap: boolean;
  /** Width of a tab character in spaces, 1 to 16. */
  tabSize: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    codeViewer: CodeViewerConfig & { locale: string; density: Density };
  }
}

export const codeViewerConfig = defineComponentConfig<CodeViewerConfig, 'locale' | 'density'>(
  'codeViewer',
  {
    lineNumbers: { default: true, expected: 'boolean', validate: validators.isBoolean },
    wrap: { default: false, expected: 'boolean', validate: validators.isBoolean },
    tabSize: { default: 2, expected: 'integer from 1 to 16', validate: validators.integerInRange(1, 16) },
  },
  ['locale', 'density'],
);

registerMessages('codeViewer', 'en', {
  copy: 'Copy',
  copyLabel: 'Copy code',
  copied: 'Code copied to the clipboard',
  copyFailed: 'The code could not be copied',
  wrap: 'Wrap lines',
  unified: 'Unified',
  split: 'Side by side',
  diffMode: 'Diff view',
  added: 'Added: ',
  removed: 'Removed: ',
  highlighted: 'Highlighted: ',
  summary: '{count} lines, {language}',
  diffSummary: '{added} added, {removed} removed',
  original: 'Original',
  modified: 'Modified',
  plain: 'Plain text',
  wrapOn: 'Lines wrap',
  wrapOff: 'Lines do not wrap',
  modeChanged: '{mode} diff',
});

export type CodeViewerDiffMode = 'unified' | 'split';

export interface CodeViewerDiff {
  /** The text before the change. */
  original: string;
  /** The text after the change. */
  modified: string;
  /** Unified (one column) or split (side by side). Default 'unified'. */
  mode?: CodeViewerDiffMode;
  /** Column headings of the side-by-side view. Default "Original" and "Modified". */
  originalLabel?: string;
  modifiedLabel?: string;
  /** Compare lines ignoring leading and trailing whitespace. Default false. */
  ignoreWhitespace?: boolean;
}

export interface CodeViewerIcons {
  copy: IconRef;
  copied: IconRef;
  unified: IconRef;
  split: IconRef;
}

/** A line number or an inclusive `[from, to]` range. */
export type CodeViewerLineRange = number | readonly [number, number];

export interface CodeViewerOptions extends Partial<CodeViewerConfig> {
  /** Accessible name of the code region, such as "Example: leave request handler". */
  label: string;
  /** Source text (ignored when `diff` is set). */
  code?: string;
  /** Show a diff of two texts instead of `code`. */
  diff?: CodeViewerDiff | null;
  /** Highlighting language. Default 'plain'. */
  language?: CodeLanguage;
  /** File name shown in the toolbar. */
  filename?: string;
  /** Number of the first line (code view). Default 1. */
  startLine?: number;
  /** Lines to highlight (line numbers as displayed; in a diff, modified line numbers). */
  highlightLines?: readonly CodeViewerLineRange[];
  /** Show the toolbar (file name, language, actions). Default true. */
  toolbar?: boolean;
  /** Show the copy button. Default true. */
  copyable?: boolean;
  /** Show the wrap toggle. Default true. */
  wrapToggle?: boolean;
  /** Maximum block size of the scroll area as a CSS length, or null to grow with the content (no virtualization). Default '30rem'. */
  maxHeight?: string | null;
  locale?: string;
  density?: Density;
  icons?: Partial<CodeViewerIcons>;
}

/** `aui-copy` detail: the text written to the clipboard. */
export interface CodeViewerCopyDetail {
  text: string;
}

/** `aui-change` detail: the user toggled wrapping or the diff mode. */
export interface CodeViewerChangeDetail {
  wrap: boolean;
  mode: CodeViewerDiffMode | null;
  reason: 'wrap' | 'mode';
}

interface Cell {
  readonly op: DiffOp;
  readonly line: number;
  readonly tokens: readonly CodeToken[];
}

type ViewRow =
  | { readonly kind: 'code'; readonly cell: Cell }
  | { readonly kind: 'unified'; readonly op: DiffOp; readonly a: number | null; readonly b: number | null; readonly tokens: readonly CodeToken[] }
  | { readonly kind: 'split'; readonly left: Cell | null; readonly right: Cell | null };

interface Model {
  readonly key: string;
  readonly rows: readonly ViewRow[];
  readonly text: string;
  readonly lines: number;
  readonly columns: number;
  readonly digits: number;
  readonly stats: { added: number; removed: number } | null;
  /** Displayed line number (modified side in a diff) to row index. */
  readonly index: ReadonlyMap<number, number>;
}

const CSS_LENGTH = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em|vh|svh|dvh|lvh|%|ch|lh|cqh))$/;
/** Above this many rows (with a bounded height) only the visible rows are rendered. */
const VIRTUAL_THRESHOLD = 400;
const OVERSCAN = 20;
const LANGUAGE_NAMES: Readonly<Record<Exclude<CodeLanguage, 'plain'>, string>> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  bash: 'Bash',
  markdown: 'Markdown',
};
const DENSITIES: readonly Density[] = ['compact', 'comfortable', 'spacious'];

/** Display width of a line in columns, with tabs expanded. */
function columnsOf(text: string, tabSize: number): number {
  let col = 0;
  for (const ch of text) col = ch === '\t' ? col + tabSize - (col % tabSize) : col + 1;
  return col;
}

function textOf(tokens: readonly CodeToken[]): string {
  return tokens.map((t) => t.text).join('');
}

export class CodeViewer {
  readonly host: HTMLElement;
  #options: CodeViewerOptions;
  readonly #doc: Document;
  readonly #id = createId('aui-code-viewer');
  readonly #toolbar: HTMLDivElement;
  readonly #filename: HTMLSpanElement;
  readonly #language: HTMLSpanElement;
  readonly #stats: HTMLSpanElement;
  readonly #actions: HTMLDivElement;
  readonly #viewport: HTMLDivElement;
  readonly #summary: HTMLSpanElement;
  readonly #head: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #copyButton: Button;
  readonly #wrapButton: Button;
  readonly #unifiedButton: Button;
  readonly #splitButton: Button;
  readonly #modeGroup: HTMLDivElement;
  #wrap: boolean;
  #mode: CodeViewerDiffMode;
  #model: Model | null = null;
  #rowsKey = '';
  #virtual = false;
  #win = new Windowing(0, 20);
  #estimate = 0;
  #rows = new Map<number, HTMLDivElement>();
  #highlight = new Set<number>();
  #copiedTimer: ReturnType<typeof setTimeout> | null = null;
  #frame = 0;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: CodeViewerOptions): CodeViewer {
    return new CodeViewer(host, options);
  }

  private constructor(host: HTMLElement, options: CodeViewerOptions) {
    CodeViewer.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    const config = this.#config();
    this.#wrap = config.wrap;
    this.#mode = options.diff?.mode ?? 'unified';

    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-code-viewer__toolbar';
    const meta = doc.createElement('div');
    meta.className = 'aui-code-viewer__meta';
    this.#filename = doc.createElement('span');
    this.#filename.className = 'aui-code-viewer__filename';
    this.#language = doc.createElement('span');
    this.#language.className = 'aui-code-viewer__language';
    this.#stats = doc.createElement('span');
    this.#stats.className = 'aui-code-viewer__stats';
    meta.append(this.#filename, this.#language, this.#stats);
    this.#actions = doc.createElement('div');
    this.#actions.className = 'aui-code-viewer__actions';
    this.#modeGroup = doc.createElement('div');
    this.#modeGroup.className = 'aui-code-viewer__modes';
    this.#modeGroup.setAttribute('role', 'group');
    this.#unifiedButton = Button.create({ variant: 'ghost', size: 'sm', pressed: true }, doc);
    this.#splitButton = Button.create({ variant: 'ghost', size: 'sm', pressed: false }, doc);
    this.#modeGroup.append(this.#unifiedButton.element, this.#splitButton.element);
    this.#wrapButton = Button.create({ variant: 'ghost', size: 'sm', pressed: this.#wrap }, doc);
    this.#copyButton = Button.create({ variant: 'ghost', size: 'sm' }, doc);
    this.#actions.append(this.#modeGroup, this.#wrapButton.element, this.#copyButton.element);
    this.#toolbar.append(meta, this.#actions);

    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-code-viewer__viewport';
    this.#viewport.id = this.#id;
    this.#viewport.setAttribute('role', 'region');
    this.#viewport.tabIndex = 0;
    this.#summary = doc.createElement('span');
    this.#summary.className = 'aui-visually-hidden aui-code-viewer__summary';
    this.#summary.id = `${this.#id}-summary`;
    this.#viewport.setAttribute('aria-describedby', this.#summary.id);
    this.#head = doc.createElement('div');
    this.#head.className = 'aui-code-viewer__head';
    this.#head.setAttribute('aria-hidden', 'true');
    this.#canvas = doc.createElement('div');
    this.#canvas.className = 'aui-code-viewer__canvas';
    this.#canvas.dir = 'ltr';
    this.#viewport.append(this.#head, this.#canvas);

    try {
      this.#render();
    } catch (error) {
      for (const b of [this.#copyButton, this.#wrapButton, this.#unifiedButton, this.#splitButton]) b.destroy();
      throw error;
    }
    host.classList.add('aui-code-viewer');
    host.replaceChildren(this.#toolbar, this.#viewport, this.#summary);
    this.#bind();
    this.#renderWindow();
  }

  get options(): Readonly<CodeViewerOptions> {
    return this.#options;
  }

  /** Whether long lines wrap. */
  get wrap(): boolean {
    return this.#wrap;
  }

  /** The diff mode, or null when showing plain code. */
  get mode(): CodeViewerDiffMode | null {
    return this.#options.diff ? this.#mode : null;
  }

  /** The diff lines (null outside diff mode). */
  get diff(): DiffLine[] | null {
    const d = this.#options.diff;
    return d ? diffLines(d.original, d.modified, d.ignoreWhitespace === true ? { ignoreWhitespace: true } : {}) : null;
  }

  /** Number of rendered rows (all rows unless virtualized). */
  get renderedRowCount(): number {
    return this.#rows.size;
  }

  /** Total number of rows. */
  get rowCount(): number {
    return this.#model?.rows.length ?? 0;
  }

  /** The text the copy button writes: the code, or the modified text of a diff. */
  get text(): string {
    return this.#model?.text ?? '';
  }

  update(options: Partial<CodeViewerOptions>): void {
    const next = { ...this.#options, ...options };
    CodeViewer.#assert(next);
    const previous = { options: this.#options, wrap: this.#wrap, mode: this.#mode };
    this.#options = next;
    if ('wrap' in options) this.#wrap = options.wrap ?? this.#config().wrap;
    if ('diff' in options && options.diff?.mode !== undefined) this.#mode = options.diff.mode;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#wrap = previous.wrap;
      this.#mode = previous.mode;
      this.#render();
      throw error;
    }
    this.#renderWindow();
  }

  /** Scroll so the line (as displayed; modified side in a diff) is visible. */
  scrollToLine(line: number, align: 'auto' | 'start' | 'center' | 'end' = 'center'): void {
    const index = this.#model?.index.get(line);
    if (index === undefined) return;
    const vp = this.#viewport;
    const headSize = this.#head.offsetHeight;
    if (this.#virtual) {
      vp.scrollTop = this.#win.scrollFor(index, vp.scrollTop, vp.clientHeight - headSize, align);
      this.#renderWindow();
      return;
    }
    const row = this.#rows.get(index);
    if (!row) return;
    const top = row.offsetTop - this.#canvas.offsetTop;
    const view = vp.clientHeight - headSize;
    const size = row.offsetHeight;
    let target = vp.scrollTop;
    if (align === 'start') target = top;
    else if (align === 'end') target = top + size - view;
    else if (align === 'center') target = top + size / 2 - view / 2;
    else if (top < vp.scrollTop) target = top;
    else if (top + size > vp.scrollTop + view) target = top + size - view;
    vp.scrollTop = Math.max(0, target);
  }

  /** Copy the code (or the modified text of a diff) to the clipboard. */
  async copy(): Promise<boolean> {
    const text = this.text;
    const locale = this.#config().locale;
    try {
      await this.#doc.defaultView?.navigator.clipboard.writeText(text);
    } catch {
      announce(getMessage('codeViewer', 'copyFailed', {}, locale), 'assertive', this.#doc);
      return false;
    }
    if (this.#group.disposed) return true;
    announce(getMessage('codeViewer', 'copied', {}, locale), 'polite', this.#doc);
    this.#copyButton.update({ icon: this.#options.icons?.copied ?? checkIcon });
    if (this.#copiedTimer !== null) clearTimeout(this.#copiedTimer);
    this.#copiedTimer = setTimeout(() => {
      this.#copiedTimer = null;
      if (!this.#group.disposed) this.#copyButton.update({ icon: this.#options.icons?.copy ?? copyIcon });
    }, 2000);
    emit(this.host, 'aui-copy', { text } satisfies CodeViewerCopyDetail);
    return true;
  }

  destroy(): void {
    this.#group.dispose();
    if (this.#copiedTimer !== null) clearTimeout(this.#copiedTimer);
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    for (const b of [this.#copyButton, this.#wrapButton, this.#unifiedButton, this.#splitButton]) b.destroy();
    this.#rows.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-code-viewer', 'aui-code-viewer--wrap', 'aui-code-viewer--diff', 'aui-code-viewer--split', 'aui-code-viewer--virtual', 'aui-code-viewer--grow', 'aui-code-viewer--numbers', ...DENSITIES.map((d) => `aui-code-viewer--${d}`));
    for (const p of ['--_aui-code-viewer-max-height', '--_aui-code-viewer-tab', '--_aui-code-viewer-digits', '--_aui-code-viewer-columns']) this.host.style.removeProperty(p);
  }

  static #assert(o: CodeViewerOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('CODE_VIEWER_OPTIONS', 'Invalid code viewer options.', { component: 'code-viewer', property: `codeViewer.${property}`, expected });
    };
    const label: unknown = o.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const code: unknown = o.code;
    if (code !== undefined && typeof code !== 'string') fail('code', 'string');
    const diff: unknown = o.diff;
    if (diff !== undefined && diff !== null) {
      if (!validators.isRecord(diff)) return fail('diff', '{ original: string; modified: string; mode?: "unified" | "split" } or null');
      if (typeof diff.original !== 'string') fail('diff.original', 'string');
      if (typeof diff.modified !== 'string') fail('diff.modified', 'string');
      if (diff.mode !== undefined && diff.mode !== 'unified' && diff.mode !== 'split') fail('diff.mode', '"unified" | "split"');
      for (const k of ['originalLabel', 'modifiedLabel'] as const) if (diff[k] !== undefined && typeof diff[k] !== 'string') fail(`diff.${k}`, 'string');
      if (diff.ignoreWhitespace !== undefined && typeof diff.ignoreWhitespace !== 'boolean') fail('diff.ignoreWhitespace', 'boolean');
    }
    const language: unknown = o.language;
    if (language !== undefined && !(typeof language === 'string' && (CODE_LANGUAGES as readonly string[]).includes(language))) fail('language', CODE_LANGUAGES.map((l) => `"${l}"`).join(' | '));
    const filename: unknown = o.filename;
    if (filename !== undefined && typeof filename !== 'string') fail('filename', 'string');
    const start: unknown = o.startLine;
    if (start !== undefined && !(typeof start === 'number' && Number.isInteger(start) && start >= 0)) fail('startLine', 'integer >= 0');
    const ranges: unknown = o.highlightLines;
    if (ranges !== undefined) {
      const isLine = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n);
      const ok = Array.isArray(ranges) && ranges.every((r: unknown) => isLine(r) || (Array.isArray(r) && r.length === 2 && isLine(r[0]) && isLine(r[1]) && Number(r[0]) <= Number(r[1])));
      if (!ok) fail('highlightLines', 'array of line numbers or [from, to] ranges');
    }
    for (const k of ['toolbar', 'copyable', 'wrapToggle'] as const) {
      const v: unknown = o[k];
      if (v !== undefined && typeof v !== 'boolean') fail(k, 'boolean');
    }
    const maxHeight: unknown = o.maxHeight;
    if (maxHeight !== undefined && maxHeight !== null && (typeof maxHeight !== 'string' || !CSS_LENGTH.test(maxHeight.trim()))) fail('maxHeight', "CSS length such as '30rem' or '480px', or null");
  }

  #config(): Readonly<CodeViewerConfig & { locale: string; density: Density }> {
    const o = this.#options;
    return codeViewerConfig.resolve({
      ...(o.lineNumbers === undefined ? {} : { lineNumbers: o.lineNumbers }),
      ...(o.wrap === undefined ? {} : { wrap: o.wrap }),
      ...(o.tabSize === undefined ? {} : { tabSize: o.tabSize }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.density === undefined ? {} : { density: o.density }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('codeViewer', id, params, this.#config().locale);
  }

  #buildModel(tabSize: number): Model {
    const o = this.#options;
    const language = o.language ?? 'plain';
    const d = o.diff ?? null;
    const mode = this.#mode;
    const key = JSON.stringify([d === null ? o.code ?? '' : [d.original, d.modified, d.ignoreWhitespace === true], d === null ? null : mode, language, o.startLine ?? 1, tabSize]);
    if (this.#model?.key === key) return this.#model;
    const rows: ViewRow[] = [];
    const index = new Map<number, number>();
    let columns = 0;
    let maxLine = 0;
    if (d === null) {
      const code = o.code ?? '';
      const lines = tokenizeLines(code, language);
      const start = o.startLine ?? 1;
      for (const [i, tokens] of lines.entries()) {
        const line = start + i;
        index.set(line, rows.length);
        rows.push({ kind: 'code', cell: { op: 'equal', line, tokens } });
        columns = Math.max(columns, columnsOf(textOf(tokens), tabSize));
      }
      maxLine = start + lines.length - 1;
      return { key, rows, text: code, lines: lines.length, columns, digits: String(Math.max(1, maxLine)).length, stats: null, index };
    }
    const diff = diffLines(d.original, d.modified, d.ignoreWhitespace === true ? { ignoreWhitespace: true } : {});
    const a = tokenizeLines(d.original, language);
    const b = tokenizeLines(d.modified, language);
    const tokensOf = (l: DiffLine): readonly CodeToken[] => (l.modifiedLine !== null ? b[l.modifiedLine - 1] : a[(l.originalLine ?? 1) - 1]) ?? [{ type: null, text: l.text }];
    for (const l of diff) {
      columns = Math.max(columns, columnsOf(l.text, tabSize));
      maxLine = Math.max(maxLine, l.originalLine ?? 0, l.modifiedLine ?? 0);
    }
    if (mode === 'unified') {
      for (const l of diff) {
        if (l.modifiedLine !== null && l.op !== 'delete') index.set(l.modifiedLine, rows.length);
        rows.push({ kind: 'unified', op: l.op, a: l.originalLine, b: l.modifiedLine, tokens: tokensOf(l) });
      }
    } else {
      // Pair each run of deletions with the following run of insertions, row by row.
      let i = 0;
      while (i < diff.length) {
        const l = diff[i];
        if (l === undefined) break;
        if (l.op === 'equal') {
          if (l.modifiedLine !== null) index.set(l.modifiedLine, rows.length);
          const right: Cell = { op: 'equal', line: l.modifiedLine ?? 0, tokens: tokensOf(l) };
          const left: Cell = { op: 'equal', line: l.originalLine ?? 0, tokens: a[(l.originalLine ?? 1) - 1] ?? right.tokens };
          rows.push({ kind: 'split', left, right });
          i++;
          continue;
        }
        const dels: DiffLine[] = [];
        const ins: DiffLine[] = [];
        for (let next = diff[i]; next?.op === 'delete'; next = diff[++i]) dels.push(next);
        for (let next = diff[i]; next?.op === 'insert'; next = diff[++i]) ins.push(next);
        for (let k = 0; k < Math.max(dels.length, ins.length); k++) {
          const dl = dels[k];
          const il = ins[k];
          if (il?.modifiedLine != null) index.set(il.modifiedLine, rows.length);
          rows.push({
            kind: 'split',
            left: dl ? { op: 'delete', line: dl.originalLine ?? 0, tokens: tokensOf(dl) } : null,
            right: il ? { op: 'insert', line: il.modifiedLine ?? 0, tokens: tokensOf(il) } : null,
          });
        }
      }
    }
    return { key, rows, text: d.modified, lines: diff.length, columns, digits: String(Math.max(1, maxLine)).length, stats: diffStats(diff), index };
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const icons = o.icons ?? {};
    const model = this.#buildModel(config.tabSize);
    const language = o.language ?? 'plain';
    const languageName = language === 'plain' ? this.#m('plain') : LANGUAGE_NAMES[language];
    const diff = o.diff ?? null;
    const split = diff !== null && this.#mode === 'split';
    const maxHeight = o.maxHeight === undefined ? '30rem' : o.maxHeight;
    const virtual = maxHeight !== null && model.rows.length > VIRTUAL_THRESHOLD;
    const host = this.host;

    host.classList.toggle('aui-code-viewer--wrap', this.#wrap || split);
    host.classList.toggle('aui-code-viewer--diff', diff !== null);
    host.classList.toggle('aui-code-viewer--split', split);
    host.classList.toggle('aui-code-viewer--virtual', virtual);
    host.classList.toggle('aui-code-viewer--grow', maxHeight === null);
    host.classList.toggle('aui-code-viewer--numbers', config.lineNumbers);
    for (const d of DENSITIES) host.classList.toggle(`aui-code-viewer--${d}`, config.density === d);
    if (maxHeight === null) host.style.removeProperty('--_aui-code-viewer-max-height');
    else host.style.setProperty('--_aui-code-viewer-max-height', maxHeight.trim());
    host.style.setProperty('--_aui-code-viewer-tab', String(config.tabSize));
    host.style.setProperty('--_aui-code-viewer-digits', String(model.digits));
    host.style.setProperty('--_aui-code-viewer-columns', String(model.columns));

    // Toolbar.
    this.#toolbar.hidden = o.toolbar === false;
    this.#filename.textContent = o.filename ?? '';
    this.#filename.hidden = (o.filename ?? '') === '';
    this.#language.textContent = languageName;
    const stats = model.stats;
    this.#stats.hidden = stats === null;
    const locale = config.locale;
    this.#stats.textContent = stats === null ? '' : this.#m('diffSummary', { added: formatNumber(stats.added, {}, locale), removed: formatNumber(stats.removed, {}, locale) });
    this.#modeGroup.hidden = diff === null;
    this.#modeGroup.setAttribute('aria-label', this.#m('diffMode'));
    // Text first: a button with an icon and no text yet would count as icon-only.
    this.#setText(this.#unifiedButton, this.#m('unified'));
    this.#setText(this.#splitButton, this.#m('split'));
    this.#setText(this.#wrapButton, this.#m('wrap'));
    this.#setText(this.#copyButton, this.#m('copy'));
    this.#unifiedButton.update({ icon: icons.unified ?? layoutListIcon, pressed: this.#mode === 'unified' });
    this.#splitButton.update({ icon: icons.split ?? layoutColumnsIcon, pressed: this.#mode === 'split' });
    this.#wrapButton.update({ pressed: this.#wrap });
    this.#wrapButton.element.hidden = o.wrapToggle === false || split;
    this.#copyButton.update({ icon: this.#copiedTimer === null ? (icons.copy ?? copyIcon) : (icons.copied ?? checkIcon), label: this.#m('copyLabel') });
    this.#copyButton.element.hidden = o.copyable === false;

    // Region name and summary.
    this.#viewport.setAttribute('aria-label', o.label);
    this.#summary.textContent = stats === null
      ? this.#m('summary', { count: formatNumber(model.lines, {}, locale), language: languageName })
      : `${this.#m('diffSummary', { added: formatNumber(stats.added, {}, locale), removed: formatNumber(stats.removed, {}, locale) })}, ${languageName}`;

    // Split headings.
    this.#head.hidden = !split;
    if (split) {
      const left = this.#doc.createElement('span');
      left.textContent = diff.originalLabel ?? this.#m('original');
      const right = this.#doc.createElement('span');
      right.textContent = diff.modifiedLabel ?? this.#m('modified');
      this.#head.replaceChildren(left, right);
    } else this.#head.replaceChildren();

    // Highlighted lines.
    const highlight = new Set<number>();
    for (const r of o.highlightLines ?? []) {
      if (typeof r === 'number') highlight.add(r);
      else for (let n = r[0]; n <= r[1] && n - r[0] < 100_000; n++) highlight.add(n);
    }
    this.#highlight = highlight;

    const rowsKey = JSON.stringify([model.key, config.lineNumbers, [...highlight], locale, virtual, config.density]);
    if (rowsKey !== this.#rowsKey || this.#model !== model) {
      this.#rowsKey = rowsKey;
      this.#model = model;
      this.#virtual = virtual;
      for (const row of this.#rows.values()) row.remove();
      this.#rows.clear();
      if (virtual) {
        this.#estimate = 0;
        this.#win.reset(model.rows.length, 20);
        this.#viewport.scrollTop = 0;
      } else {
        this.#canvas.style.removeProperty('--_aui-code-viewer-total');
        const frag = this.#doc.createDocumentFragment();
        for (const [i, row] of model.rows.entries()) {
          const el = this.#buildRow(row);
          this.#rows.set(i, el);
          frag.append(el);
        }
        this.#canvas.replaceChildren(frag);
      }
    } else if (virtual) {
      // Wrapping changed the row heights.
      this.#win.clearMeasurements();
    }
  }

  #setText(button: Button, text: string): void {
    const el = button.element;
    let node: Text | null = null;
    for (const child of el.childNodes) if (child instanceof Text) node = child;
    if (node) node.data = text;
    else el.append(this.#doc.createTextNode(text));
  }

  #renderTokens(target: HTMLElement, tokens: readonly CodeToken[]): void {
    const doc = this.#doc;
    for (const t of tokens) {
      if (t.type === null) target.append(doc.createTextNode(t.text));
      else {
        const span = doc.createElement('span');
        span.className = `aui-code-viewer__t aui-code-viewer__t--${t.type}`;
        span.textContent = t.text;
        target.append(span);
      }
    }
  }

  #number(n: number | null, extra = ''): HTMLSpanElement {
    const span = this.#doc.createElement('span');
    span.className = `aui-code-viewer__num${extra}`;
    span.setAttribute('aria-hidden', 'true');
    span.textContent = n === null ? '' : String(n);
    return span;
  }

  #cell(target: HTMLElement, op: DiffOp, line: number | null, tokens: readonly CodeToken[], numbers: readonly (number | null)[], diff: boolean): void {
    const doc = this.#doc;
    if (this.#config().lineNumbers) for (const n of numbers) target.append(this.#number(n));
    if (diff) {
      const marker = doc.createElement('span');
      marker.className = 'aui-code-viewer__marker';
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = op === 'insert' ? '+' : op === 'delete' ? '-' : ' ';
      target.append(marker);
    }
    const code = doc.createElement('span');
    code.className = 'aui-code-viewer__code';
    const highlighted = line !== null && op !== 'delete' && this.#highlight.has(line);
    const prefix = op === 'insert' ? 'added' : op === 'delete' ? 'removed' : highlighted ? 'highlighted' : null;
    if (prefix !== null) {
      const sr = doc.createElement('span');
      sr.className = 'aui-visually-hidden';
      sr.textContent = this.#m(prefix);
      code.append(sr);
    }
    this.#renderTokens(code, tokens);
    target.append(code);
    target.classList.toggle('aui-code-viewer__line--highlight', highlighted);
    target.classList.toggle('aui-code-viewer__line--insert', op === 'insert');
    target.classList.toggle('aui-code-viewer__line--delete', op === 'delete');
  }

  #buildRow(row: ViewRow): HTMLDivElement {
    const doc = this.#doc;
    const el = doc.createElement('div');
    el.className = 'aui-code-viewer__row';
    if (row.kind === 'code') {
      el.classList.add('aui-code-viewer__line');
      this.#cell(el, 'equal', row.cell.line, row.cell.tokens, [row.cell.line], false);
    } else if (row.kind === 'unified') {
      el.classList.add('aui-code-viewer__line');
      this.#cell(el, row.op, row.b, row.tokens, [row.a, row.b], true);
    } else {
      el.classList.add('aui-code-viewer__row--split');
      for (const cell of [row.left, row.right]) {
        const side = doc.createElement('div');
        side.className = 'aui-code-viewer__line aui-code-viewer__side';
        if (cell) this.#cell(side, cell.op, cell === row.right ? cell.line : null, cell.tokens, [cell.line], true);
        else side.classList.add('aui-code-viewer__side--empty');
        el.append(side);
      }
    }
    return el;
  }

  /** Virtual mode: render the rows in view (plus overscan) and position them. */
  #renderWindow(): void {
    if (!this.#virtual || this.#group.disposed) return;
    const model = this.#model;
    if (!model) return;
    const vp = this.#viewport;
    const view = Math.max(1, vp.clientHeight - this.#head.offsetHeight);
    const win = this.#win;
    const range = win.rendered(vp.scrollTop, view, OVERSCAN);
    for (const [i, el] of this.#rows) {
      if (i < range.start || i >= range.end) {
        el.remove();
        this.#rows.delete(i);
      }
    }
    for (let i = range.start; i < range.end; i++) {
      if (this.#rows.has(i)) continue;
      const row = model.rows[i];
      if (!row) continue;
      const el = this.#buildRow(row);
      el.classList.add('aui-code-viewer__row--abs');
      this.#rows.set(i, el);
      this.#canvas.append(el);
    }
    // Measure: one estimate for fixed rows, every rendered row when lines wrap.
    const variable = this.host.classList.contains('aui-code-viewer--wrap');
    let changed = false;
    if (!variable && this.#estimate === 0) {
      const first = this.#rows.values().next().value;
      const h = first?.getBoundingClientRect().height ?? 0;
      if (h > 0) {
        this.#estimate = h;
        if (Math.abs(h - win.estimate) > 0.25) {
          win.reset(model.rows.length, h);
          changed = true;
        }
      }
    } else if (variable) {
      for (const [i, el] of this.#rows) {
        const h = el.getBoundingClientRect().height;
        if (h > 0 && win.setSize(i, h) !== 0) changed = true;
      }
    }
    this.#canvas.style.setProperty('--_aui-code-viewer-total', `${String(win.total)}px`);
    for (const [i, el] of this.#rows) el.style.setProperty('--_aui-code-viewer-y', `${String(win.offsetOf(i))}px`);
    if (changed) this.#schedule();
  }

  #schedule(): void {
    if (this.#frame !== 0) return;
    const win = this.#doc.defaultView;
    if (!win) return;
    this.#frame = win.requestAnimationFrame(() => {
      this.#frame = 0;
      this.#renderWindow();
    });
  }

  #emitChange(reason: 'wrap' | 'mode'): void {
    emit(this.host, 'aui-change', { wrap: this.#wrap, mode: this.mode, reason } satisfies CodeViewerChangeDetail);
  }

  #bind(): void {
    const g = this.#group;
    g.listen(this.#viewport, 'scroll', () => {
      this.#renderWindow();
    }, { passive: true });
    g.add(observeResize(this.#viewport, () => {
      if (this.#virtual && this.host.classList.contains('aui-code-viewer--wrap')) this.#win.clearMeasurements();
      this.#schedule();
    }));
    g.add(codeViewerConfig.subscribe(() => {
      if ((this.#options.wrap ?? null) === null) this.#wrap = this.#config().wrap;
      this.#render();
      this.#renderWindow();
    }));
    // Toggle buttons report their own aui-change; it is replaced by the viewer's event.
    const onToggle = (button: Button, handle: () => void): void => {
      g.listen(button.element, 'aui-change' as keyof HTMLElementEventMap, (event) => {
        event.stopPropagation();
        handle();
      });
    };
    onToggle(this.#wrapButton, () => {
      this.#wrap = this.#wrapButton.pressed === true;
      this.#render();
      this.#renderWindow();
      announce(this.#m(this.#wrap ? 'wrapOn' : 'wrapOff'), 'polite', this.#doc);
      this.#emitChange('wrap');
    });
    const setMode = (mode: CodeViewerDiffMode): void => {
      const changed = mode !== this.#mode;
      this.#mode = mode;
      this.#render();
      this.#renderWindow();
      if (!changed) return;
      announce(this.#m('modeChanged', { mode: this.#m(mode) }), 'polite', this.#doc);
      this.#emitChange('mode');
    };
    onToggle(this.#unifiedButton, () => {
      setMode('unified');
    });
    onToggle(this.#splitButton, () => {
      setMode('split');
    });
    g.listen(this.#copyButton.element, 'click', () => {
      void this.copy();
    });
  }
}
