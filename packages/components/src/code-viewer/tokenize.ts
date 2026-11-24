/**
 * Code Viewer tokenizer (R20 P10). A small scanner per language: an ordered list of sticky
 * regular expressions, tried at each position, with a per-language state object for the
 * few context-sensitive cases (CSS property vs selector, HTML inside or outside a tag).
 * The output is plain data (token type and text); the viewer turns it into text nodes, so
 * nothing is ever parsed as HTML. Tokens spanning lines (block comments, template literals,
 * fenced code) are split per line afterwards.
 */

export type CodeLanguage = 'typescript' | 'javascript' | 'json' | 'html' | 'css' | 'sql' | 'bash' | 'markdown' | 'plain';

export const CODE_LANGUAGES: readonly CodeLanguage[] = ['typescript', 'javascript', 'json', 'html', 'css', 'sql', 'bash', 'markdown', 'plain'];

/** Token classes; each maps to a `aui-code-viewer__t--<type>` class and a theme token. */
export type CodeTokenType = 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'type' | 'tag' | 'attr' | 'variable' | 'punctuation' | 'heading' | 'emphasis' | 'link' | 'code';

export interface CodeToken {
  /** null for plain text (identifiers, whitespace, operators without a class). */
  readonly type: CodeTokenType | null;
  readonly text: string;
}

interface State {
  depth: number;
  inValue: boolean;
  inTag: boolean;
  afterTagOpen: boolean;
}

type Classifier = (match: string, state: State, rest: string) => CodeTokenType | null;

interface Rule {
  readonly re: RegExp;
  readonly type: CodeTokenType | null | Classifier;
  readonly after?: (match: string, state: State) => void;
  /** Only tried when this returns true. */
  readonly when?: (state: State) => boolean;
}

const words = (list: string): ReadonlySet<string> => new Set(list.split(' '));

const JS_KEYWORDS = words(
  'abstract as async await break case catch class const continue debugger declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface is keyof let namespace new of package private protected public readonly return satisfies set static super switch this throw try type typeof var void while with yield',
);
const JS_LITERALS = words('true false null undefined NaN Infinity');
const TS_TYPES = words('any boolean bigint never number object string symbol unknown void');
const SQL_KEYWORDS = words(
  'add all alter and any as asc between by case cast check column constraint create cross database default delete desc distinct drop else end exists false foreign from full group having if in index inner insert into is join key left like limit not null offset on or order outer primary references returning right select set table then true truncate union unique update using values view when where with',
);
const SQL_TYPES = words('bigint boolean char date decimal double float int integer interval json jsonb numeric real serial smallint text time timestamp timestamptz uuid varchar');
const BASH_KEYWORDS = words('case do done elif else esac export fi for function if in local readonly return select shift source then until unset while');

const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y;
const SPACE = /\s+/y;

function jsRules(typescript: boolean): Rule[] {
  return [
    { re: SPACE, type: null },
    { re: /\/\/[^\n]*/y, type: 'comment' },
    { re: /\/\*[\s\S]*?(?:\*\/|$)/y, type: 'comment' },
    { re: /'(?:[^'\\\n]|\\.)*'?/y, type: 'string' },
    { re: /"(?:[^"\\\n]|\\.)*"?/y, type: 'string' },
    { re: /`(?:[^`\\]|\\[\s\S])*`?/y, type: 'string' },
    { re: NUMBER, type: 'number' },
    { re: /@[A-Za-z_$][\w$]*/y, type: 'function' },
    {
      re: /[A-Za-z_$][\w$]*/y,
      type: (word, _state, rest) => {
        if (JS_LITERALS.has(word)) return 'keyword';
        if (JS_KEYWORDS.has(word)) return 'keyword';
        if (typescript && TS_TYPES.has(word)) return 'type';
        if (/^\s*\(/.test(rest)) return 'function';
        if (/^[A-Z]/.test(word)) return 'type';
        return null;
      },
    },
    { re: /[{}()[\];,.]/y, type: 'punctuation' },
  ];
}

const JSON_RULES: Rule[] = [
  { re: SPACE, type: null },
  { re: /"(?:[^"\\\n]|\\.)*"?/y, type: (_m, _s, rest) => (/^\s*:/.test(rest) ? 'attr' : 'string') },
  { re: /-?(?:\d+(?:\.\d+)?)(?:[eE][+-]?\d+)?/y, type: 'number' },
  { re: /\b(?:true|false|null)\b/y, type: 'keyword' },
  { re: /[{}[\],:]/y, type: 'punctuation' },
];

const CSS_RULES: Rule[] = [
  { re: SPACE, type: null },
  { re: /\/\*[\s\S]*?(?:\*\/|$)/y, type: 'comment' },
  { re: /'(?:[^'\\\n]|\\.)*'?/y, type: 'string' },
  { re: /"(?:[^"\\\n]|\\.)*"?/y, type: 'string' },
  { re: /@[\w-]+/y, type: 'keyword' },
  {
    re: /\{/y,
    type: 'punctuation',
    after: (_m, s) => {
      s.depth++;
      s.inValue = false;
    },
  },
  {
    re: /\}/y,
    type: 'punctuation',
    after: (_m, s) => {
      s.depth = Math.max(0, s.depth - 1);
      s.inValue = false;
    },
  },
  { re: /;/y, type: 'punctuation', after: (_m, s) => { s.inValue = false; } },
  // Inside a block, "name:" starts a declaration (nested selectors such as "&:hover {" do not).
  { re: /-?-?[A-Za-z][\w-]*(?=\s*:(?![^;{}]*\{))/y, type: 'attr', when: (s) => s.depth > 0 && !s.inValue },
  { re: /:/y, type: 'punctuation', after: (_m, s) => { if (s.depth > 0) s.inValue = true; }, when: (s) => s.depth > 0 && !s.inValue },
  { re: /#[\da-fA-F]{3,8}\b/y, type: 'number', when: (s) => s.inValue },
  { re: /-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-zA-Z]+|%)?/y, type: 'number', when: (s) => s.inValue },
  { re: /!important\b/y, type: 'keyword' },
  { re: /[\w-]+(?=\()/y, type: 'function' },
  // Outside declarations: selectors (elements, classes, ids, pseudo-classes, attributes).
  { re: /(?:[.#]?-?[A-Za-z_][\w-]*|::?[\w-]+|\*)/y, type: (_m, s) => (s.inValue ? null : 'tag') },
  { re: /[(),>+~[\]=]/y, type: 'punctuation' },
];

const SQL_RULES: Rule[] = [
  { re: SPACE, type: null },
  { re: /--[^\n]*/y, type: 'comment' },
  { re: /\/\*[\s\S]*?(?:\*\/|$)/y, type: 'comment' },
  { re: /'(?:[^']|'')*'?/y, type: 'string' },
  { re: /"(?:[^"]|"")*"?/y, type: 'attr' },
  { re: /(?:\$\d+|:[A-Za-z_]\w*|\?)/y, type: 'variable' },
  { re: /(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/y, type: 'number' },
  {
    re: /[A-Za-z_][\w$]*/y,
    type: (word, _s, rest) => {
      const w = word.toLowerCase();
      if (SQL_KEYWORDS.has(w)) return 'keyword';
      if (SQL_TYPES.has(w)) return 'type';
      if (/^\s*\(/.test(rest)) return 'function';
      return null;
    },
  },
  { re: /[(),;.*]/y, type: 'punctuation' },
];

const BASH_RULES: Rule[] = [
  { re: /[ \t]+|\n/y, type: null },
  { re: /#[^\n]*/y, type: 'comment' },
  { re: /'[^']*'?/y, type: 'string' },
  { re: /"(?:[^"\\]|\\[\s\S])*"?/y, type: 'string' },
  { re: /\$\{[^}\n]*\}?|\$\(|\$[\w@#?$!*-]/y, type: 'variable' },
  { re: /--?[A-Za-z][\w-]*/y, type: 'attr' },
  { re: /\d+(?![\w])/y, type: 'number' },
  {
    re: /[A-Za-z_][\w.-]*/y,
    type: (word, _s, rest) => {
      if (BASH_KEYWORDS.has(word)) return 'keyword';
      if (rest.startsWith('=')) return 'variable';
      return null;
    },
  },
  { re: /[|&;<>(){}[\]\\]/y, type: 'punctuation' },
];

const HTML_RULES: Rule[] = [
  { re: /<!--[\s\S]*?(?:-->|$)/y, type: 'comment', when: (s) => !s.inTag },
  { re: /<!DOCTYPE[^>]*>?/iy, type: 'keyword', when: (s) => !s.inTag },
  {
    re: /<\/?(?=[A-Za-z])/y,
    type: 'punctuation',
    after: (_m, s) => {
      s.inTag = true;
      s.afterTagOpen = true;
    },
    when: (s) => !s.inTag,
  },
  { re: /&(?:#\d+|#x[\da-fA-F]+|[A-Za-z]+);/y, type: 'number', when: (s) => !s.inTag },
  { re: /[^<&]+/y, type: null, when: (s) => !s.inTag },
  { re: /\s+/y, type: null, when: (s) => s.inTag },
  {
    re: /[A-Za-z][\w:-]*/y,
    type: (_m, s) => (s.afterTagOpen ? 'tag' : 'attr'),
    after: (_m, s) => {
      s.afterTagOpen = false;
    },
    when: (s) => s.inTag,
  },
  { re: /"[^"]*"?|'[^']*'?/y, type: 'string', when: (s) => s.inTag },
  {
    re: /\/?>/y,
    type: 'punctuation',
    after: (_m, s) => {
      s.inTag = false;
      s.afterTagOpen = false;
    },
    when: (s) => s.inTag,
  },
  { re: /=/y, type: 'punctuation', when: (s) => s.inTag },
  { re: /[^\s>"'=/]+/y, type: 'string', when: (s) => s.inTag },
];

const MARKDOWN_RULES: Rule[] = [
  { re: /^```[^\n]*\n[\s\S]*?(?:^```[^\n]*|$(?![\s\S]))/my, type: 'code' },
  { re: /^#{1,6}[ \t][^\n]*/my, type: 'heading' },
  { re: /^[ \t]*(?:[-*+]|\d+[.)])(?=[ \t])/my, type: 'punctuation' },
  { re: /^>/my, type: 'punctuation' },
  { re: /`[^`\n]+`/y, type: 'code' },
  { re: /!?\[[^\]\n]*\]\([^)\n]*\)/y, type: 'link' },
  { re: /\*\*[^*\n]+\*\*|__[^_\n]+__/y, type: 'emphasis' },
  { re: /\*[^*\s][^*\n]*\*|(?<![\w])_[^_\s][^_\n]*_(?![\w])/y, type: 'emphasis' },
  { re: /[^\n`![*_#>\-+\d]+|\n|./y, type: null },
];

const RULES: Readonly<Record<Exclude<CodeLanguage, 'plain'>, readonly Rule[]>> = {
  typescript: jsRules(true),
  javascript: jsRules(false),
  json: JSON_RULES,
  css: CSS_RULES,
  sql: SQL_RULES,
  bash: BASH_RULES,
  html: HTML_RULES,
  markdown: MARKDOWN_RULES,
};

/** Tokenize source text into a flat token list (adjacent plain text merged). */
export function tokenize(code: string, language: CodeLanguage): CodeToken[] {
  if (language === 'plain' || code === '') return code === '' ? [] : [{ type: null, text: code }];
  const rules = RULES[language];
  const state: State = { depth: 0, inValue: false, inTag: false, afterTagOpen: false };
  const out: CodeToken[] = [];
  const push = (type: CodeTokenType | null, text: string): void => {
    if (text === '') return;
    const last = out[out.length - 1];
    if (last?.type === type) out[out.length - 1] = { type, text: last.text + text };
    else out.push({ type, text });
  };
  let pos = 0;
  while (pos < code.length) {
    let matched = false;
    for (const rule of rules) {
      if (rule.when !== undefined && !rule.when(state)) continue;
      rule.re.lastIndex = pos;
      const m = rule.re.exec(code);
      if (m === null || m[0] === '') continue;
      const text = m[0];
      const type = typeof rule.type === 'function' ? rule.type(text, state, code.slice(pos + text.length, pos + text.length + 40)) : rule.type;
      push(type, text);
      rule.after?.(text, state);
      pos += text.length;
      matched = true;
      break;
    }
    if (!matched) {
      push(null, code.charAt(pos));
      pos++;
    }
  }
  return out;
}

/** Split text into lines (`\r\n`, `\r`, and `\n`); a single trailing newline does not add an empty line. */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Tokenize and split into lines; tokens that span lines are split at each line break. */
export function tokenizeLines(code: string, language: CodeLanguage): CodeToken[][] {
  const normalized = code.replace(/\r\n?/g, '\n');
  const lines: CodeToken[][] = [[]];
  for (const token of tokenize(normalized, language)) {
    const parts = token.text.split('\n');
    for (const [i, part] of parts.entries()) {
      if (i > 0) lines.push([]);
      if (part !== '') lines[lines.length - 1]?.push({ type: token.type, text: part });
    }
  }
  if (lines.length > 1 && lines[lines.length - 1]?.length === 0 && normalized.endsWith('\n')) lines.pop();
  return lines;
}
