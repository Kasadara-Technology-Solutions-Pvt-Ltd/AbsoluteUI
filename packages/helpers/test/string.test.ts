import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ENGLISH_MINOR_WORDS,
  between,
  byteLengthUtf8,
  camelCase,
  capitalize,
  center,
  charCount,
  collapseWhitespace,
  compareIgnoreCase,
  constantCase,
  containsIgnoreCase,
  countOccurrences,
  damerauLevenshtein,
  dedent,
  dotCase,
  endsWithAny,
  equalsIgnoreCase,
  escapeHtml,
  escapeRegExp,
  formatList,
  fuzzyMatch,
  graphemeLength,
  graphemes,
  highlight,
  indent,
  initials,
  isAlpha,
  isAlphanumeric,
  isNumeric,
  kebabCase,
  levenshtein,
  mask,
  maskEmail,
  normalizeWhitespace,
  pascalCase,
  pluralize,
  removeDiacritics,
  replaceAllSafe,
  reverseGraphemes,
  sentenceCase,
  similarity,
  slugify,
  snakeCase,
  splitLines,
  splitWords,
  startsWithAny,
  stripControlChars,
  template,
  titleCase,
  toCodePoints,
  truncate,
  truncateMiddle,
  uncapitalize,
  unescapeHtml,
  wordCount,
  wrapText,
} from '@absoluteui/helpers/string';
import { ValidationError } from '@absoluteui/helpers/error';
import { graphemesFallback } from '../src/string/internal.js';

/** Runs `fn` and asserts it finishes within `ms` (ReDoS guard). */
function fast(fn: () => unknown, ms = 300): void {
  const t = performance.now();
  fn();
  expect(performance.now() - t).toBeLessThan(ms);
}

const wordy = fc.string({ unit: fc.constantFrom(...'abcXYZ019 _-.éÉßİıǅ\u0301'.split('')), maxLength: 30 });

describe('splitWords', () => {
  it('splits identifiers and phrases', () => {
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(splitWords('fooBarBaz')).toEqual(['foo', 'Bar', 'Baz']);
    expect(splitWords('foo_bar-baz qux.quux')).toEqual(['foo', 'bar', 'baz', 'qux', 'quux']);
    expect(splitWords('  __leading--and trailing__ ')).toEqual(['leading', 'and', 'trailing']);
    expect(splitWords('getHTTPResponseCode')).toEqual(['get', 'HTTP', 'Response', 'Code']);
    expect(splitWords('version2Beta')).toEqual(['version2', 'Beta']);
    expect(splitWords('item2Id', { splitDigits: true })).toEqual(['item', '2', 'Id']);
    expect(splitWords('öffne_DieTür-2x')).toEqual(['öffne', 'Die', 'Tür', '2x']);
    expect(splitWords("don't stop")).toEqual(["don't", 'stop']);
    expect(splitWords('e\u0301clair')).toEqual(['e\u0301clair']);
    expect(splitWords('東京タワー tokyo')).toEqual(['東京タワー', 'tokyo']);
    expect(splitWords('ПриветМир')).toEqual(['Привет', 'Мир']);
    expect(splitWords('')).toEqual([]);
    expect(splitWords('!!!')).toEqual([]);
  });
  it('is linear on long input', () => {
    fast(() => splitWords('aB'.repeat(50_000)), 1000);
  });
});

describe('case conversion', () => {
  it('converts', () => {
    expect(camelCase('user_first-name')).toBe('userFirstName');
    expect(camelCase('XMLHttpRequest')).toBe('xmlHttpRequest');
    expect(camelCase("don't stop")).toBe('dontStop');
    expect(pascalCase('user first name')).toBe('UserFirstName');
    expect(kebabCase('XMLHttpRequest')).toBe('xml-http-request');
    expect(snakeCase('userFirstName')).toBe('user_first_name');
    expect(dotCase('userFirstName')).toBe('user.first.name');
    expect(constantCase('maxRetryCount')).toBe('MAX_RETRY_COUNT');
    expect(sentenceCase('userFirstName')).toBe('User first name');
    expect(titleCase('the_lord-of the rings', { minorWords: ENGLISH_MINOR_WORDS })).toBe('The Lord of the Rings');
    expect(titleCase('of mice and men')).toBe('Of Mice And Men');
    expect(titleCase('what is it for', { minorWords: ['for', 'is'] })).toBe('What is It For');
    expect(camelCase('')).toBe('');
  });
  it('is locale-aware only when asked', () => {
    expect(pascalCase('istanbul izmir')).toBe('IstanbulIzmir');
    expect(pascalCase('istanbul izmir', { locale: 'tr' })).toBe('İstanbulİzmir');
    expect(kebabCase('TITLE')).toBe('title');
    expect(kebabCase('TITLE', { locale: 'tr' })).toBe('tıtle');
    expect(constantCase('straße')).toBe('STRASSE');
  });
  it('kebab/snake/constant/dot are idempotent', () => {
    fc.assert(
      fc.property(wordy, (s) => {
        for (const f of [kebabCase, snakeCase, constantCase, dotCase]) expect(f(f(s))).toBe(f(s));
      }),
    );
  });
  it('camel/pascal are idempotent on word lists and interconvert', () => {
    const word = fc.string({ unit: fc.constantFrom(...'abcdefghij'.split('')), minLength: 2, maxLength: 6 });
    fc.assert(
      fc.property(fc.array(word, { minLength: 1, maxLength: 5 }), (words) => {
        const s = words.join(' ');
        expect(camelCase(camelCase(s))).toBe(camelCase(s));
        expect(pascalCase(pascalCase(s))).toBe(pascalCase(s));
        expect(kebabCase(camelCase(s))).toBe(words.join('-'));
        expect(snakeCase(pascalCase(s))).toBe(words.join('_'));
        expect(camelCase(kebabCase(s))).toBe(camelCase(s));
      }),
    );
  });
  it('capitalize / uncapitalize', () => {
    expect(capitalize('élan')).toBe('Élan');
    expect(capitalize('hELLO', { lowerRest: true })).toBe('Hello');
    expect(capitalize('istanbul', { locale: 'tr' })).toBe('İstanbul');
    expect(capitalize('😀a')).toBe('😀a');
    expect(capitalize('')).toBe('');
    expect(uncapitalize('Hello World')).toBe('hello World');
    expect(uncapitalize('')).toBe('');
  });
});

describe('slugify and diacritics', () => {
  it('removes diacritics', () => {
    expect(removeDiacritics('Crème Brûlée, Łódź, Ærø')).toBe('Creme Brulee, Lodz, Æro');
    expect(removeDiacritics('e\u0301')).toBe('e');
    expect(removeDiacritics('ह\u093fन\u094dद\u0940')).toBe('ह\u093fन\u094dद\u0940');
  });
  it('slugifies', () => {
    expect(slugify('Crème Brûlée & Café!')).toBe('creme-brulee-cafe');
    expect(slugify('  Hello,   World  ')).toBe('hello-world');
    expect(slugify('İstanbul', { locale: 'tr' })).toBe('istanbul');
    expect(slugify('Straße Æther')).toBe('strasse-aether');
    expect(slugify("Don't panic")).toBe('dont-panic');
    expect(slugify('ﬁle №1')).toBe('file-no1');
    expect(slugify('東京 タワー')).toBe('東京-タワー');
    expect(slugify('東京 tower', { ascii: true })).toBe('tower');
    expect(slugify('Hello World', { separator: '_', lowercase: false })).toBe('Hello_World');
    expect(slugify('a b', { separator: '' })).toBe('ab');
    expect(slugify('the quick brown fox', { maxLength: 12 })).toBe('the-quick');
    expect(slugify('abcdefghijkl', { maxLength: 5 })).toBe('abcde');
    expect(slugify('hello world', { maxLength: 11 })).toBe('hello-world');
    expect(slugify('hello-world again', { maxLength: 6 })).toBe('hello');
    expect(slugify('!!!')).toBe('');
  });
  it('slugs contain only word chars and single separators', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        const slug = slugify(s, { ascii: true });
        expect(slug).toMatch(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/);
        expect(slugify(slug, { ascii: true })).toBe(slug);
      }),
    );
  });
});

describe('graphemes', () => {
  it('counts and splits user-perceived characters', () => {
    expect(graphemes('👍🏽e\u0301')).toEqual(['👍🏽', 'e\u0301']);
    expect(graphemeLength('👨\u200d👩\u200d👧')).toBe(1);
    expect(graphemeLength('🇮🇳🇺🇸')).toBe(2);
    expect(graphemeLength('')).toBe(0);
    expect(reverseGraphemes('ab👍🏽')).toBe('👍🏽ba');
    expect(charCount('😀', { unit: 'codeUnit' })).toBe(2);
    expect(charCount('😀', { unit: 'codePoint' })).toBe(1);
    expect(charCount('e\u0301')).toBe(1);
  });
  it('fallback segmentation agrees with Intl.Segmenter on common text', () => {
    for (const s of ['👍🏽e\u0301x', '👨\u200d👩\u200d👧 hi', '🇮🇳🇺🇸🇫', 'a\r\nb', 'ﾃﾞ', '❤\ufe0f', '🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}', 'नमस\u094dत\u0947']) {
      expect([...graphemesFallback(s)], s).toEqual(graphemes(s));
    }
  });
  it('reverseGraphemes is an involution', () => {
    fc.assert(fc.property(fc.string({ unit: 'grapheme-composite', maxLength: 20 }), (s) => reverseGraphemes(reverseGraphemes(s)) === s));
  });
});

describe('truncate', () => {
  it('truncates by graphemes', () => {
    expect(truncate('Hello world', 20)).toBe('Hello world');
    expect(truncate('Hello world', 8)).toBe('Hello w…');
    expect(truncate('Hello wonderful world', 12, { wordBoundary: true })).toBe('Hello…');
    expect(truncate('Hello, wonderful world', 10, { wordBoundary: true })).toBe('Hello…');
    expect(truncate('Supercalifragilistic', 8, { wordBoundary: true })).toBe('Superca…');
    expect(truncate('👍🏽👍🏽👍🏽', 2)).toBe('👍🏽…');
    expect(truncate('e\u0301e\u0301e\u0301', 2)).toBe('e\u0301…');
    expect(truncate('abcdef', 4, { omission: '...' })).toBe('a...');
    expect(truncate('abcdef', 2, { omission: '...' })).toBe('..');
    expect(truncate('abc', 0)).toBe('');
    expect(truncate('abc', 3)).toBe('abc');
  });
  it('never exceeds the limit and never splits a grapheme', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme-composite', maxLength: 30 }), fc.integer({ min: 0, max: 35 }), fc.boolean(), (s, n, wb) => {
        const t = truncate(s, n, { wordBoundary: wb });
        expect(graphemeLength(t)).toBeLessThanOrEqual(Math.max(n, 0));
        const gs = graphemes(s);
        if (gs.length <= n) expect(t).toBe(s);
        else if (n > 1) expect(s.startsWith(t.slice(0, -1))).toBe(true);
      }),
    );
  });
  it('stops early on huge input', () => {
    fast(() => truncate('x'.repeat(5_000_000), 10), 200);
  });
  it('truncateMiddle and center', () => {
    expect(truncateMiddle('annual-report-2026-final.pdf', 15)).toBe('annual-…nal.pdf');
    expect(truncateMiddle('short', 10)).toBe('short');
    expect(truncateMiddle('abcdef', 2)).toBe('a…');
    expect(truncateMiddle('abcdef', 1)).toBe('…');
    expect(center('ab', 6, '*')).toBe('**ab**');
    expect(center('ab', 5)).toBe(' ab  ');
    expect(center('abc', 2)).toBe('abc');
    expect(center('ab', 6, '-=')).toBe('-=ab-=');
  });
});

describe('masking', () => {
  it('masks', () => {
    expect(mask('4111111111111111', { visibleEnd: 4 })).toBe('••••••••••••1111');
    expect(mask('4111 1111 1111 1111', { visibleEnd: 4, preserve: ' ' })).toBe('•••• •••• •••• 1111');
    expect(mask('secret')).toBe('••••••');
    expect(mask('abc', { visibleStart: 2, visibleEnd: 2 })).toBe('•••');
    expect(mask('abcdef', { visibleStart: 1, visibleEnd: 1, maskChar: '*' })).toBe('a****f');
    expect(mask('👍🏽👍🏽👍🏽', { visibleEnd: 1 })).toBe('••👍🏽');
  });
  it('masks emails', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j•••••••@example.com');
    expect(maskEmail('ann@example.com', { maskDomain: true })).toBe('a••@e••••••.com');
    expect(maskEmail('a@example.com')).toBe('•@example.com');
    expect(maskEmail('not-an-email')).toBe('••••••••••••');
  });
});

describe('whitespace and control characters', () => {
  it('normalizes and collapses', () => {
    expect(normalizeWhitespace('a\u00a0b\r\nc\rd\u2028e\u200bf\tg')).toBe('a b\nc\nd\nef g');
    expect(collapseWhitespace('  a \n\t b\u00a0 ')).toBe('a b');
  });
  it('strips control characters', () => {
    expect(stripControlChars('a\u0000b\u202ec\n\t\u0085d')).toBe('abc\n\td');
    expect(stripControlChars('a\nb', { keepWhitespace: false })).toBe('ab');
    expect(stripControlChars('a\u202eb', { stripBidi: false })).toBe('a\u202eb');
    expect(stripControlChars('👨\u200d👩\u200d👧')).toBe('👨\u200d👩\u200d👧');
  });
  it('lines, indent, dedent, wrap', () => {
    expect(splitLines('a\r\nb\nc\rd\u2029e')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(indent('a\n\nb', 2)).toBe('  a\n\n  b');
    expect(indent('a\n\nb', '> ', { indentEmpty: true })).toBe('> a\n> \n> b');
    expect(dedent('    a\n      b\n\n    c')).toBe('a\n  b\n\nc');
    expect(dedent('\tx\n\t\ty')).toBe('x\n\ty');
    expect(dedent('a\n  b')).toBe('a\n  b');
    expect(wrapText('The quick brown fox', 10)).toBe('The quick\nbrown fox');
    expect(wrapText('abcdefghij kl', 4)).toBe('abcd\nefgh\nij\nkl');
    expect(wrapText('abcdefghij', 4, { breakWords: false })).toBe('abcdefghij');
    expect(wrapText('a b\n\nc d', 3)).toBe('a b\n\nc d');
    expect(wrapText('👍🏽👍🏽👍🏽 x', 2)).toBe('👍🏽👍🏽\n👍🏽\nx');
  });
  it('wrapText lines never exceed width when words are breakable', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.integer({ min: 1, max: 12 }), (s, w) => {
        for (const line of splitLines(wrapText(s, w))) expect(graphemeLength(line)).toBeLessThanOrEqual(w);
      }),
    );
  });
});

describe('counting and searching', () => {
  it('counts words with Intl.Segmenter', () => {
    expect(wordCount("Don't stop, it's 2026!")).toBe(4);
    expect(wordCount('')).toBe(0);
    expect(wordCount('東京に行きます', { locale: 'ja' })).toBeGreaterThan(1);
  });
  it('counts occurrences and replaces literally', () => {
    expect(countOccurrences('aaaa', 'aa')).toBe(2);
    expect(countOccurrences('aaaa', 'aa', { overlapping: true })).toBe(3);
    expect(countOccurrences('abc', '')).toBe(0);
    expect(replaceAllSafe('a.b.c', '.', '$&')).toBe('a$&b$&c');
    expect(replaceAllSafe('abc', '', 'x')).toBe('abc');
    expect(between('key=[value]', '[', ']')).toBe('value');
    expect(between('a[b', '[', ']')).toBeUndefined();
    expect(between('ab', '[', ']')).toBeUndefined();
    expect(startsWithAny('https://x', ['http://', 'https://'])).toBe(true);
    expect(startsWithAny('ftp://x', ['http://'])).toBe(false);
    expect(endsWithAny('photo.jpg', new Set(['.png', '.jpg']))).toBe(true);
    expect(endsWithAny('photo.gif', ['.png'])).toBe(false);
  });
  it('compares ignoring case and accents', () => {
    expect(containsIgnoreCase('Crème Brûlée', 'BRÛLÉE')).toBe(true);
    expect(containsIgnoreCase('Crème Brûlée', 'BRULEE')).toBe(false);
    expect(containsIgnoreCase('Crème Brûlée', 'BRULEE', { ignoreAccents: true })).toBe(true);
    expect(containsIgnoreCase('Cre\u0300me', 'crème')).toBe(true);
    expect(containsIgnoreCase('DİYARBAKIR', 'diyarbakır', { locale: 'tr' })).toBe(true);
    expect(containsIgnoreCase('abc', '')).toBe(true);
    expect(equalsIgnoreCase('Résumé', 'RÉSUMÉ')).toBe(true);
    expect(equalsIgnoreCase('Résumé', 'resume')).toBe(false);
    expect(equalsIgnoreCase('Résumé', 'resume', { ignoreAccents: true })).toBe(true);
    expect(compareIgnoreCase('a', 'B')).toBe(-1);
    expect(compareIgnoreCase('B', 'a')).toBe(1);
    expect(compareIgnoreCase('A', 'a')).toBe(0);
  });
  it('character classes', () => {
    expect(isAlpha('Ñandú')).toBe(true);
    expect(isAlpha('Na\u0303ndu')).toBe(true);
    expect(isAlpha('ab1')).toBe(false);
    expect(isAlpha('')).toBe(false);
    expect(isNumeric('0123')).toBe(true);
    expect(isNumeric('٣٤')).toBe(true);
    expect(isNumeric('1.5')).toBe(false);
    expect(isNumeric('')).toBe(false);
    expect(isAlphanumeric('abc123')).toBe(true);
    expect(isAlphanumeric('abc 123')).toBe(false);
    expect(toCodePoints('a😀')).toEqual([97, 128512]);
  });
  it('byteLengthUtf8 matches TextEncoder', () => {
    expect(byteLengthUtf8('€')).toBe(3);
    expect(byteLengthUtf8('\ud800')).toBe(3);
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 50 }), (s) => byteLengthUtf8(s) === new TextEncoder().encode(s).length));
  });
});

describe('escaping', () => {
  it('escapes and unescapes HTML', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    expect(unescapeHtml('Tom &amp; Jerry&#39;s &#x1F600; &lt;&gt;&quot;&apos;&#x27;&nbsp;')).toBe(`Tom & Jerry's 😀 <>"''\u00a0`);
    expect(unescapeHtml('&AMP; &#0; &#xD800; &#99999999; &unknown; &amp')).toBe('& \ufffd \ufffd &#99999999; &unknown; &amp');
    expect(unescapeHtml('&amp;lt;')).toBe('&lt;');
  });
  it('escapeHtml round-trips', () => {
    fc.assert(fc.property(fc.string(), (s) => unescapeHtml(escapeHtml(s)) === s));
  });
  it('escapes RegExp syntax', () => {
    expect(escapeRegExp('1+1=2?')).toBe('1\\+1=2\\?');
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(new RegExp(`^${escapeRegExp(s)}$`).test(s)).toBe(true);
        expect(new RegExp(`^${escapeRegExp(s)}$`, 'u').test(s) || /\p{Cs}/u.test(s)).toBe(true);
      }),
    );
  });
  it('ReDoS: regex-backed helpers stay linear on adversarial input', () => {
    const n = 100_000;
    fast(() => unescapeHtml('&#'.repeat(n) + '&#x'.repeat(n)));
    fast(() => template(`{${' '.repeat(n)}a.${'b.'.repeat(n)}`, {}));
    fast(() => template('{a'.repeat(n), {}));
    fast(() => isAlpha(`${'a\u0301'.repeat(n)}1`));
    fast(() => isAlphanumeric(`${'a1'.repeat(n)}!`));
    fast(() => normalizeWhitespace(' \r'.repeat(n)));
    fast(() => collapseWhitespace(`${' \t'.repeat(n)}x`));
    fast(() => slugify('-a'.repeat(n)), 1000);
    fast(() => wordCount("a'".repeat(n)));
    fast(() => splitLines('\r'.repeat(n)));
  });
});

describe('template', () => {
  it('interpolates safely', () => {
    expect(template('Hello {user.name}, you have {count} tasks', { user: { name: 'Ann' }, count: 3 })).toBe('Hello Ann, you have 3 tasks');
    expect(template('{ a }/{b}/{c}', { a: 1n, b: false, c: new Date(Date.UTC(2026, 0, 1)) })).toBe('1/false/2026-01-01T00:00:00.000Z');
    expect(template('{{literal}} {x}', { x: 1 })).toBe('{literal} 1');
    expect(template('{items.0}', { items: ['first'] })).toBe('first');
    expect(template('{a-b} {}', { 'a-b': 1 })).toBe('{a-b} {}');
  });
  it('handles missing values', () => {
    expect(template('{x} {y}', { x: 1 })).toBe('1 {y}');
    expect(template('{x} {y}', { x: 1 }, { missing: 'empty' })).toBe('1 ');
    expect(() => template('{y}', {}, { missing: 'error' })).toThrow(ValidationError);
    expect(template('{o} {n}', { o: { a: 1 }, n: null })).toBe('{o} {n}');
  });
  it('never reads inherited or unsafe properties and never evaluates code', () => {
    const proto = { secret: 's' };
    const obj = Object.create(proto) as object;
    expect(template('{secret}', obj)).toBe('{secret}');
    expect(template('{constructor.name} {__proto__} {toString} {a.constructor.prototype}', { a: {} })).toBe('{constructor.name} {__proto__} {toString} {a.constructor.prototype}');
    expect(template('{x.length}', { x: 'abc' })).toBe('{x.length}');
    expect(template('{alert(1)} ${x}', { x: 1 })).toBe('{alert(1)} $1');
  });
  it('applies escape', () => {
    expect(template('<b>{name}</b>', { name: '<i>' }, { escape: escapeHtml })).toBe('<b>&lt;i&gt;</b>');
  });
});

describe('edit distance', () => {
  it('levenshtein', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('😀a', 'a')).toBe(1);
    expect(levenshtein('kitten', 'sitting', { maxDistance: 1 })).toBe(2);
    expect(levenshtein('a', 'abcdef', { maxDistance: 2 })).toBe(3);
  });
  it('damerauLevenshtein', () => {
    expect(damerauLevenshtein('ca', 'ac')).toBe(1);
    expect(levenshtein('ca', 'ac')).toBe(2);
    expect(damerauLevenshtein('abcdef', 'badcfe')).toBe(3);
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3);
    expect(damerauLevenshtein('abc', 'xyz', { maxDistance: 1 })).toBe(2);
  });
  it('satisfies metric laws and matches a reference implementation', () => {
    const ref = (a: string, b: string): number => {
      const s = Array.from(a);
      const t = Array.from(b);
      const d = Array.from({ length: s.length + 1 }, (_, i) => Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
      for (let i = 1; i <= s.length; i++) for (let j = 1; j <= t.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (s[i - 1] === t[j - 1] ? 0 : 1));
      return d[s.length]![t.length]!;
    };
    const str = fc.string({ unit: fc.constantFrom('a', 'b', 'c', '😀'), maxLength: 10 });
    fc.assert(
      fc.property(str, str, str, fc.integer({ min: 0, max: 5 }), (a, b, c, max) => {
        const d = levenshtein(a, b);
        expect(d).toBe(ref(a, b));
        expect(levenshtein(b, a)).toBe(d);
        expect(levenshtein(a, c)).toBeLessThanOrEqual(d + levenshtein(b, c));
        expect(levenshtein(a, b, { maxDistance: max })).toBe(Math.min(d, max + 1));
        expect(damerauLevenshtein(a, b)).toBeLessThanOrEqual(d);
      }),
    );
  });
  it('early exit keeps huge unequal inputs fast', () => {
    fast(() => levenshtein('a'.repeat(20_000), 'b'.repeat(20_000), { maxDistance: 3 }), 200);
  });
  it('similarity', () => {
    expect(similarity('color', 'colour')).toBeCloseTo(0.833, 3);
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
    expect(similarity('ABC', 'abc', { ignoreCase: true })).toBe(1);
    expect(similarity('Café', 'cafe', { ignoreAccents: true })).toBe(1);
  });
});

describe('fuzzyMatch and highlight', () => {
  const names = ['John Smith', 'Jane Doe', 'Johnny Appleseed', 'Joanna Smithers', 'Émile Zola'];
  it('ranks exact > prefix > word start > substring > subsequence', () => {
    const r = fuzzyMatch('smith', ['Blacksmith', 'Smith', 'John Smith', 'Smithers', 's-m-i-t-h']);
    expect(r.map((x) => x.item)).toEqual(['Smith', 'Smithers', 'John Smith', 'Blacksmith', 's-m-i-t-h']);
    expect(r[0]!.score).toBe(1);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.score).toBeGreaterThanOrEqual(r[i]!.score);
  });
  it('returns match ranges for highlighting', () => {
    const [first] = fuzzyMatch('jsmi', names);
    expect(first?.item).toBe('John Smith');
    expect(first?.ranges).toEqual([
      [0, 1],
      [5, 8],
    ]);
    expect(highlight(first!.text, first!.ranges)).toEqual([
      { text: 'J', match: true },
      { text: 'ohn ', match: false },
      { text: 'Smi', match: true },
      { text: 'th', match: false },
    ]);
  });
  it('is accent- and case-insensitive with original indices', () => {
    const [m] = fuzzyMatch('emile', names);
    expect(m?.item).toBe('Émile Zola');
    expect(m?.ranges).toEqual([[0, 5]]);
    const decomposed = 'E\u0301mile';
    expect(fuzzyMatch('emile', [decomposed])[0]?.ranges).toEqual([[0, 6]]);
    expect(fuzzyMatch('emile', names, { ignoreAccents: false })).toEqual([]);
  });
  it('supports keys, limit, threshold, empty query', () => {
    const people = [
      { name: 'Ann Lee', email: 'ann@x.test' },
      { name: 'Bob', email: 'bob.annex@x.test' },
      { name: 'Cy', email: null },
    ];
    const r = fuzzyMatch('ann', people, { keys: ['name', (p) => p.email] });
    expect(r.map((x) => [x.item.name, x.key])).toEqual([
      ['Ann Lee', 0],
      ['Bob', 1],
    ]);
    expect(fuzzyMatch('j', names, { limit: 2 })).toHaveLength(2);
    expect(fuzzyMatch('jsmi', names, { threshold: 0.9 })).toEqual([]);
    expect(fuzzyMatch('', names)).toHaveLength(names.length);
    expect(fuzzyMatch('zzz', names)).toEqual([]);
  });
  it('every range points at matched characters (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 4 }), fc.array(fc.string({ maxLength: 20 }), { maxLength: 10 }), (q, cands) => {
        for (const m of fuzzyMatch(q, cands)) {
          expect(m.score).toBeGreaterThanOrEqual(0);
          expect(m.score).toBeLessThanOrEqual(1);
          const segs = highlight(m.text, m.ranges);
          expect(segs.map((s) => s.text).join('')).toBe(m.text);
        }
      }),
    );
  });
  it('highlight by query', () => {
    expect(highlight('Crème brûlée', 'brulee')).toEqual([
      { text: 'Crème ', match: false },
      { text: 'brûlée', match: true },
    ]);
    expect(highlight('a b a', 'a')).toEqual([
      { text: 'a', match: true },
      { text: ' b ', match: false },
      { text: 'a', match: true },
    ]);
    expect(highlight('John Smith', 'smith john', { words: true })).toEqual([
      { text: 'John', match: true },
      { text: ' ', match: false },
      { text: 'Smith', match: true },
    ]);
    expect(highlight('abc', '')).toEqual([{ text: 'abc', match: false }]);
    expect(highlight('', 'a')).toEqual([]);
    expect(highlight('abc', [[1, 99], [-5, 1]])).toEqual([{ text: 'abc', match: true }]);
    expect(highlight('aaa', 'aa')).toEqual([
      { text: 'aa', match: true },
      { text: 'a', match: false },
    ]);
  });
  it('is fast on long candidates', () => {
    const long = 'ab'.repeat(5000);
    fast(() => fuzzyMatch('abababababz', Array.from({ length: 50 }, () => long)), 1500);
  });
});

describe('plurals, lists, initials', () => {
  it('pluralizes with Intl.PluralRules', () => {
    const files = { one: '{count} file', other: '{count} files' };
    expect(pluralize(1, files)).toBe('1 file');
    expect(pluralize(2, files)).toBe('2 files');
    expect(pluralize(1234, files)).toBe('1,234 files');
    expect(pluralize(0, { zero: 'No files', ...files })).toBe('No files');
    expect(pluralize(0, files)).toBe('0 files');
    const pl = { one: '{count} plik', few: '{count} pliki', many: '{count} plików', other: '{count} pliku' };
    expect(pluralize(1, pl, { locale: 'pl' })).toBe('1 plik');
    expect(pluralize(3, pl, { locale: 'pl' })).toBe('3 pliki');
    expect(pluralize(5, pl, { locale: 'pl' })).toBe('5 plików');
    expect(pluralize(1.5, pl, { locale: 'pl' })).toBe('1,5 pliku');
    expect(pluralize(2, { two: 'two', other: 'many' }, { locale: 'ar' })).toBe('two');
    expect(pluralize(3, { one: '#st', two: '#nd', few: '#rd', other: '#th' }, { type: 'ordinal' })).toBe('#rd');
    expect(pluralize(5, { other: 'items' })).toBe('items');
  });
  it('formats lists', () => {
    expect(formatList(['red', 'green', 'blue'], { locale: 'en' })).toBe('red, green, and blue');
    expect(formatList(['tea', 'coffee'], { locale: 'en', type: 'disjunction' })).toBe('tea or coffee');
    expect(formatList(['a', 'b'], { locale: 'de' })).toBe('a und b');
    expect(formatList([])).toBe('');
  });
  it('builds initials', () => {
    expect(initials('John Ronald Reuel Tolkien')).toBe('JT');
    expect(initials('John Ronald Reuel Tolkien', { max: 3 })).toBe('JRT');
    expect(initials('élodie durand')).toBe('ÉD');
    expect(initials('  (ann)  "lee" ')).toBe('AL');
    expect(initials('istanbul', { locale: 'tr' })).toBe('İ');
    expect(initials('👍🏽 x')).toBe('X');
    expect(initials('')).toBe('');
    expect(initials('madonna', { max: 0 })).toBe('M');
  });
});
