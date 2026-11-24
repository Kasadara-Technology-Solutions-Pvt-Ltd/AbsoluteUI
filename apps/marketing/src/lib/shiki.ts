// Build-time syntax highlighting (MR plan M2) with Shiki. A small theme in the site's code colours,
// and a transformer that replaces Shiki's inline `style` colours with classes, so pages need no
// inline styles under the hash-only CSP. Used from Astro components at build time only.
import { codeToHtml, type ShikiTransformer, type ThemeRegistration } from 'shiki';

export type CodeLang = 'ts' | 'js' | 'html' | 'css' | 'sh' | 'json' | 'ini';

const COLORS = {
  text: '#e2e8f0',
  keyword: '#c4b5fd',
  string: '#86efac',
  name: '#93c5fd',
  number: '#fdba74',
  comment: '#94a3b8',
} as const;

/** Colour -> class; every colour the theme can emit must be listed here. */
const CLASS_BY_COLOR: ReadonlyMap<string, string> = new Map([
  [COLORS.text, 'tok-t'],
  [COLORS.keyword, 'tok-k'],
  [COLORS.string, 'tok-s'],
  [COLORS.name, 'tok-f'],
  [COLORS.number, 'tok-n'],
  [COLORS.comment, 'tok-c'],
]);

const theme: ThemeRegistration = {
  name: 'absoluteui-site',
  type: 'dark',
  fg: COLORS.text,
  bg: '#111d35',
  settings: [
    { settings: { foreground: COLORS.text } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: COLORS.comment, fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'constant.language', 'variable.language', 'keyword.operator.new', 'entity.name.tag', 'support.type.primitive'], settings: { foreground: COLORS.keyword } },
    { scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string', 'entity.other.attribute-name'], settings: { foreground: COLORS.string } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call', 'entity.name.type', 'entity.name.class', 'support.class', 'meta.decorator'], settings: { foreground: COLORS.name } },
    { scope: ['constant.numeric', 'constant.other.color', 'support.constant'], settings: { foreground: COLORS.number } },
  ],
};

function styleToClass(): ShikiTransformer {
  return {
    name: 'absoluteui-style-to-class',
    pre(node) {
      delete node.properties.style;
      // Keep Shiki's tabindex="0": code can scroll horizontally and must be reachable by keyboard.
      node.properties.class = 'code-block';
    },
    span(node) {
      const style = typeof node.properties.style === 'string' ? node.properties.style : '';
      delete node.properties.style;
      const color = /color:\s*(#[0-9a-f]{6})/i.exec(style)?.[1]?.toLowerCase();
      const cls = color ? CLASS_BY_COLOR.get(color) : undefined;
      if (color && !cls) throw new Error(`shiki: colour ${color} has no class`);
      if (cls && cls !== 'tok-t') node.properties.class = cls;
    },
  };
}

/** Highlight code to HTML (`<pre class="code-block"><code>...`), classes only. */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
  const html = await codeToHtml(code.replace(/\s+$/, ''), { lang: lang === 'sh' ? 'shellscript' : lang, theme, transformers: [styleToClass()] });
  if (/\sstyle="/.test(html)) throw new Error('shiki: inline style left in highlighted code');
  return html;
}
