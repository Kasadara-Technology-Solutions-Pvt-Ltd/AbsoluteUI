/** Unicode-aware word splitting for case conversion. */

const UPPER_RE = /[\p{Lu}\p{Lt}]/u;
const LOWER_RE = /\p{Ll}/u;
const LETTER_RE = /\p{L}/u;
const DIGIT_RE = /\p{N}/u;
const MARK_RE = /\p{M}/u;

const enum K {
  Upper,
  Lower,
  Other,
  Digit,
  Mark,
  Apostrophe,
  Sep,
}

function kind(ch: string): K {
  if (UPPER_RE.test(ch)) return K.Upper;
  if (LOWER_RE.test(ch)) return K.Lower;
  if (LETTER_RE.test(ch)) return K.Other;
  if (DIGIT_RE.test(ch)) return K.Digit;
  if (MARK_RE.test(ch)) return K.Mark;
  if (ch === "'" || ch === '\u2019') return K.Apostrophe;
  return K.Sep;
}

export interface SplitWordsOptions {
  /** Split between letters and digits (`item2Id` -> `item`, `2`, `Id`). Default false: digits stay with the preceding word. */
  readonly splitDigits?: boolean;
}

interface Unit {
  text: string;
  readonly k: K;
}

/**
 * Splits identifiers and phrases into words: separators, lower->upper humps, acronym boundaries
 * (`XMLHttpRequest` -> `XML`, `Http`, `Request`), optionally digits. Combining marks stay with
 * their letter; apostrophes inside words are kept (`don't`).
 * @example
 * splitWords('XMLHttpRequest'); // => ['XML', 'Http', 'Request']
 * splitWords('öffne_DieTür-2x'); // => ['öffne', 'Die', 'Tür', '2x']
 */
export function splitWords(input: string, options: SplitWordsOptions = {}): string[] {
  const splitDigits = options.splitDigits === true;
  const words: string[] = [];
  let units: Unit[] = [];
  const flush = (): void => {
    if (units.length) words.push(units.map((u) => u.text).join(''));
    units = [];
  };
  const chars = Array.from(input);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    const k = kind(ch);
    if (k === K.Sep) {
      flush();
      continue;
    }
    const last = units[units.length - 1];
    if (k === K.Mark) {
      if (last) last.text += ch;
      continue;
    }
    if (k === K.Apostrophe) {
      const next = chars[i + 1];
      if (last && last.k !== K.Digit && next !== undefined && LETTER_RE.test(next)) last.text += ch;
      else flush();
      continue;
    }
    if (last) {
      const p = last.k;
      const letter = k === K.Upper || k === K.Lower || k === K.Other;
      const prevLetter = p === K.Upper || p === K.Lower || p === K.Other;
      if (k === K.Upper && (p === K.Lower || p === K.Other || (p === K.Digit && LOWER_RE.test(chars[i + 1] ?? '')))) flush();
      else if (k === K.Lower && p === K.Upper && units.length >= 2 && units[units.length - 2]?.k === K.Upper) {
        // Acronym followed by a word: "XMLHttp" -> "XML" + "Http".
        const moved = units.pop();
        flush();
        if (moved) units.push(moved);
      } else if (splitDigits && ((k === K.Digit && prevLetter) || (letter && p === K.Digit))) flush();
    }
    units.push({ text: ch, k });
  }
  flush();
  return words;
}
