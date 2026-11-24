/** Internal string machinery: Intl caches, grapheme iteration with fallback, accent/case folding. */

const MAX_CACHE = 32;

/** Bounded cache for Intl objects keyed by locale and options. */
export function cached<T>(map: Map<string, T>, key: string, create: () => T): T {
  let v = map.get(key);
  if (v === undefined) {
    if (map.size >= MAX_CACHE) map.clear();
    v = create();
    map.set(key, v);
  }
  return v;
}

/** Stable cache key for a locales argument. */
export function localeKey(locale: Intl.LocalesArgument): string {
  if (locale === undefined) return '';
  if (typeof locale === 'string') return locale;
  if (locale instanceof Intl.Locale) return locale.toString();
  return locale.map((l) => (typeof l === 'string' ? l : l.toString())).join(',');
}

/** Locale-aware lowercase; locale-independent when `locale` is undefined (identifiers must not depend on the host locale). */
export const lower = (s: string, locale: Intl.LocalesArgument): string => (locale === undefined ? s.toLowerCase() : s.toLocaleLowerCase(locale));
/** Locale-aware uppercase; locale-independent when `locale` is undefined. */
export const upper = (s: string, locale: Intl.LocalesArgument): string => (locale === undefined ? s.toUpperCase() : s.toLocaleUpperCase(locale));

// ---------------------------------------------------------------------------
// Graphemes

let graphemeSegmenter: Intl.Segmenter | undefined;
const hasSegmenter = typeof Intl.Segmenter === 'function';

// Grapheme_Extend plus spacing marks (UAX #29 GB9, GB9a).
const MARK_RE = /[\p{Grapheme_Extend}\p{Mc}]/u;
// Indic conjunct linkers (UAX #29 GB9c): virama + consonant stays one cluster.
const LINKERS = new Set([0x094d, 0x09cd, 0x0acd, 0x0b4d, 0x0c4d, 0x0d4d]);
const LETTER_RE = /\p{L}/u;
const isRegional = (cp: number): boolean => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const isExtender = (cp: number): boolean =>
  (cp >= 0x1f3fb && cp <= 0x1f3ff) || // emoji skin-tone modifiers
  (cp >= 0xe0020 && cp <= 0xe007f) || // tag characters
  (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
  cp === 0x200d;

/** Approximate extended grapheme clusters (UAX #29 subset) for runtimes without `Intl.Segmenter`. */
export function* graphemesFallback(s: string): Generator<string> {
  let cur = '';
  let prevCp = -1;
  let riCount = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const join =
      cur !== '' &&
      ((prevCp === 0x0d && cp === 0x0a) || MARK_RE.test(ch) || isExtender(cp) || prevCp === 0x200d || (LINKERS.has(prevCp) && LETTER_RE.test(ch)) || (isRegional(cp) && isRegional(prevCp) && riCount % 2 === 1));
    if (!join && cur !== '') {
      yield cur;
      cur = '';
      riCount = 0;
    }
    cur += ch;
    riCount = isRegional(cp) ? riCount + 1 : 0;
    prevCp = cp;
  }
  if (cur !== '') yield cur;
}

/** Lazily iterates grapheme clusters. */
export function* iterGraphemes(s: string): Generator<string> {
  if (!hasSegmenter) {
    yield* graphemesFallback(s);
    return;
  }
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const seg of graphemeSegmenter.segment(s)) yield seg.segment;
}

/** Grapheme clusters as an array; stops after `limit` clusters when given. */
export function graphemeArray(s: string, limit = Infinity): string[] {
  const out: string[] = [];
  if (limit <= 0) return out;
  for (const g of iterGraphemes(s)) {
    out.push(g);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diacritics and folding

/** Combining diacritical marks (Latin, Greek, Cyrillic); marks of other scripts are letters' vowel signs and stay. */
// eslint-disable-next-line no-misleading-character-class -- intentional: each combining mark is matched on its own.
export const DIACRITICS_RE = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/gu;
/** Letters with strokes that do not decompose under NFD. */
export const STROKE_MAP: Readonly<Record<string, string>> = { \u00f8: 'o', \u00d8: 'O', \u0142: 'l', \u0141: 'L', \u0111: 'd', \u0110: 'D', \u0127: 'h', \u0126: 'H', \u0167: 't', \u0166: 'T', \u0180: 'b', \u0268: 'i', \u0289: 'u' };
export const STROKE_RE = /[\u00f8\u00d8\u0142\u0141\u0111\u0110\u0127\u0126\u0167\u0166\u0180\u0268\u0289]/gu;

export function stripDiacritics(s: string, form: 'NFD' | 'NFKD' = 'NFD'): string {
  return s.normalize(form).replace(DIACRITICS_RE, '').normalize('NFC').replace(STROKE_RE, (c) => STROKE_MAP[c] ?? c);
}

export interface Folded {
  /** Folded text (lowercase, optionally without accents). */
  readonly text: string;
  /** For each folded code unit: start index in the original string. */
  readonly starts: readonly number[];
  /** For each folded code unit: end index (exclusive) in the original string. */
  readonly ends: readonly number[];
}

/** Case- and optionally accent-folds `s`, keeping a map back to original indices (for highlighting). */
export function foldWithMap(s: string, locale: Intl.LocalesArgument, stripAccents: boolean): Folded {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  for (const ch of s) {
    let f = lower(ch, locale);
    if (stripAccents) f = stripDiacritics(f);
    if (f === '' && ends.length) ends[ends.length - 1] = i + ch.length;
    for (let k = f.length; k > 0; k--) {
      starts.push(i);
      ends.push(i + ch.length);
    }
    text += f;
    i += ch.length;
  }
  return { text, starts, ends };
}

/** Case- and optionally accent-folds `s` (no index map). */
export function fold(s: string, locale: Intl.LocalesArgument, stripAccents: boolean): string {
  const l = lower(s, locale);
  return stripAccents ? stripDiacritics(l) : l;
}
