import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
import { AbsoluteUIError, defaultSanitizePolicy, sanitizeHtml, sanitizeHtmlToString } from '@absoluteui/core';

// Known XSS / mutation-XSS vectors (SPEC section 14.5 verification).
const XSS_VECTORS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="java&#x09;script:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href=" \u0001javascript:alert(1)">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">',
  '<body onload=alert(1)>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<p onclick="alert(1)">x</p>',
  '<p ONCLICK="alert(1)">x</p>',
  '<form action="javascript:alert(1)"><button>x</button></form>',
  '<button formaction="javascript:alert(1)">x</button>',
  '<input onfocus=alert(1) autofocus>',
  '<details open ontoggle=alert(1)>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<svg><p><style><img src=x onerror=alert(1)></style></p></svg>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<template><script>alert(1)</script></template>',
  '<style>@import "javascript:alert(1)"</style>',
  '<base href="javascript:alert(1)//">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<link rel=stylesheet href="javascript:alert(1)">',
  '<a href="#" is="evil-element">x</a>',
  '<xmp><img src=x onerror=alert(1)></xmp>',
  '<textarea><img src=x onerror=alert(1)></textarea>',
  '<title><img src=x onerror=alert(1)></title>',
  '<select><option><img src=x onerror=alert(1)></option></select>',
  '<!--><img src=x onerror=alert(1)>-->',
  '<a href="https://example.com" onmouseover="alert(1)">safe link</a>',
  '<blockquote cite="javascript:alert(1)">q</blockquote>',
  '<p dir="javascript:alert(1)">x</p>',
];

const BENIGN = [
  '<p>Hello <strong>world</strong></p>',
  '<ul><li>One</li><li>Two</li></ul>',
  '<a href="https://example.com/a?b=c" title="t">link</a>',
  '<a href="mailto:a@example.com">mail</a>',
  '<a href="/relative/path">rel</a>',
  '<blockquote cite="https://example.com">q</blockquote>',
  '<pre><code>const a = 1 &lt; 2;</code></pre>',
  '<p lang="fr" dir="rtl">texte</p>',
  'plain &amp; text',
  '<h2>Title</h2><hr><p>Body<br>line</p>',
];

const ALLOWED = new Set(Object.keys(defaultSanitizePolicy.elements));

function assertSafe(html: string): void {
  const container = document.createElement('div');
  container.appendChild(sanitizeHtml(html));
  for (const el of Array.from(container.querySelectorAll('*'))) {
    expect(ALLOWED.has(el.localName), `element <${el.localName}> from ${html}`).toBe(true);
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.startsWith('on'), `attribute ${attr.name}`).toBe(false);
      expect(['style', 'srcdoc', 'is']).not.toContain(attr.name);
      if (['href', 'cite', 'src'].includes(attr.name)) {
        const protocol = new URL(attr.value, 'https://base.invalid/').protocol;
        expect(['http:', 'https:', 'mailto:'], `${attr.name}=${attr.value}`).toContain(protocol);
      }
      if (attr.name === 'dir') expect(['ltr', 'rtl', 'auto']).toContain(attr.value);
    }
  }
}

function purify(html: string): string {
  const allowedAttrs = new Set<string>([...defaultSanitizePolicy.globalAttributes]);
  for (const attrs of Object.values(defaultSanitizePolicy.elements)) for (const a of attrs) allowedAttrs.add(a);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED],
    ALLOWED_ATTR: [...allowedAttrs],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_CONTENTS: ['title', 'textarea', 'select', 'option', 'form', 'button', 'input', 'img', 'video', 'audio', 'source', 'track', 'canvas', 'picture', 'dialog', 'portal', 'head', 'script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'noembed', 'noframes', 'svg', 'math', 'xmp', 'plaintext', 'listing'],
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

/**
 * Reviewed divergences from the DOMPurify oracle where AbsoluteUI is STRICTER by design.
 * Every entry requires a justification; a divergence not listed here fails the test.
 */
const REVIEWED_STRICTER: Record<string, string> = {
  '<p dir="javascript:alert(1)">x</p>': 'AbsoluteUI validates dir values (ltr|rtl|auto); DOMPurify allows any dir value.',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">':
    'AbsoluteUI parses with scripting disabled and drops <noscript> with its content; DOMPurify keeps an empty <p>.',
  '<a href="#" is="evil-element">x</a>': 'AbsoluteUI removes the customized-built-in "is" attribute; DOMPurify keeps it with an empty value.',
};

describe('sanitizer: XSS corpus', () => {
  it.each(XSS_VECTORS)('neutralizes %s', (vector) => {
    assertSafe(vector);
    expect(sanitizeHtmlToString(vector)).not.toMatch(/javascript:|onerror|onload|onclick|<script|<iframe|<svg|<math/i);
  });
});

describe('sanitizer: benign content is preserved', () => {
  it.each(BENIGN)('keeps %s', (html) => {
    expect(sanitizeHtmlToString(html)).toBe(DOMPurify.sanitize(html));
  });
});

describe('sanitizer: differential against DOMPurify oracle (dev-time only)', () => {
  it.each([...XSS_VECTORS, ...BENIGN])('matches oracle for %s', (html) => {
    const ours = sanitizeHtmlToString(html);
    const oracle = purify(html);
    if (ours !== oracle) {
      expect(REVIEWED_STRICTER[html], `unreviewed divergence\n ours:   ${ours}\n oracle: ${oracle}`).toBeDefined();
      assertSafe(html);
    }
  });
});

describe('sanitizer: behavior', () => {
  it('is idempotent (no mutation on re-sanitization)', () => {
    for (const html of [...XSS_VECTORS, ...BENIGN]) {
      const once = sanitizeHtmlToString(html);
      expect(sanitizeHtmlToString(once)).toBe(once);
    }
  });

  it('adds rel=noopener when a consumer allows target', () => {
    const out = sanitizeHtmlToString('<a href="https://x.test" target="_blank">x</a>', { elements: { a: ['href', 'target'] } });
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('never allows forbidden elements even if a consumer allowlists them', () => {
    const out = sanitizeHtmlToString('<script>alert(1)</script><svg></svg>', { elements: { script: [], svg: [] } });
    expect(out).toBe('');
  });

  it('can disallow relative URLs', () => {
    expect(sanitizeHtmlToString('<a href="/x">x</a>', { allowRelativeUrls: false })).toBe('<a>x</a>');
  });

  it('rejects oversized input predictably', () => {
    expect(() => sanitizeHtml('a'.repeat(11), { maxLength: 10 })).toThrow(AbsoluteUIError);
  });

  it('survives deeply nested input without stack overflow', () => {
    expect(() => sanitizeHtml('<span>'.repeat(5000))).not.toThrow();
  });
});

describe('sanitizer: seeded fuzzing', () => {
  const pieces = ['<p>', '</p>', '<a href="', 'javascript:', 'https://x.test', '">', '</a>', '<svg>', '<math>', '<mtext>', '<style>', '</style>', '<img src=x onerror=alert(1)>', '<!--', '-->', '<noscript>', '</noscript>', '<table>', '<mglyph>', '<form>', '</form>', '<b>', 'text', '"', "'", '<', '>', '&lt;', '<template>', '<textarea>', '<select>', '<iframe>', ' onclick=alert(1) ', '<ul><li>'];
  let seed = 0x5eed;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  it('keeps safety and idempotence invariants for 20,000 random inputs', () => {
    for (let i = 0; i < 20000; i++) {
      const length = 1 + Math.floor(random() * 20);
      let html = '';
      for (let j = 0; j < length; j++) html += pieces[Math.floor(random() * pieces.length)] ?? '';
      assertSafe(html);
      const once = sanitizeHtmlToString(html);
      expect(sanitizeHtmlToString(once), html).toBe(once);
    }
  }, 30_000); // CPU-bound (about 9 s alone); allow for a fully loaded parallel run.
});
