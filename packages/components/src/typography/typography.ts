/**
 * Typography (SPEC section 18.2). The CSS classes (`aui-heading`, `aui-text`,
 * `aui-link`, `aui-code`, `aui-prose`, `aui-truncate`, `aui-line-clamp`) are the
 * primary API. The JS helpers create correctly structured, validated elements:
 * heading level (document outline) is independent of visual size, link
 * destinations are restricted to http(s) and relative URLs, and links that open
 * a new tab say so in a localized, visually hidden hint.
 */
import { configurationError, defineComponentConfig, getMessage, registerMessages, validators, type Disposer } from '@absoluteui/core';
import { AppliedStyles } from '../layout/applied.js';
import { isSafeHref } from './href.js';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type TextTone = 'default' | 'muted';
export type TextSize = 'xs' | 'sm' | 'md' | 'lg';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- only the inherited locale is configurable
export interface TypographyConfig {}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    typography: TypographyConfig & { locale: string };
  }
}

export const typographyConfig = defineComponentConfig<TypographyConfig, 'locale'>('typography', {}, ['locale']);

registerMessages('typography', 'en', {
  opensInNewTab: '(opens in a new tab)',
});

export interface HeadingOptions {
  /** Visual size 1 (largest) to 6; defaults to the semantic level. */
  size?: HeadingLevel;
}

export interface TextOptions {
  tone?: TextTone;
  size?: TextSize;
  /** Semibold weight. */
  strong?: boolean;
  /** Default `p`. Use `span` inside other text. */
  as?: 'p' | 'span';
}

export interface LinkOptions {
  /** http(s) URL or relative reference. `javascript:`, `data:`, and other schemes are rejected. */
  href: string;
  /** Visible link text (the accessible name). */
  text: string;
  /** Open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`) and say so to assistive technology. */
  external?: boolean;
  /** Muted color for secondary links; the underline still identifies the link. */
  muted?: boolean;
  locale?: string;
}

/** Options of an enhanced link (since 0.9.0): the element keeps its own href and text. */
export type LinkEnhanceOptions = Omit<LinkOptions, 'href' | 'text'>;

/** Text options of an enhanced element (since 0.9.0): the element keeps its own tag. */
export type TextEnhanceOptions = Omit<TextOptions, 'as'>;

/** Styling applied to an existing element by an `enhance` helper (since 0.9.0). */
export interface TypographyEnhancement<O> {
  update(options: O): void;
  /** Remove the classes, attributes, and nodes the helper added. */
  destroy(): void;
}

const LEVEL_EXPECTED = 'integer 1..6';
const TONES: readonly TextTone[] = ['default', 'muted'];
const SIZES: readonly TextSize[] = ['xs', 'sm', 'md', 'lg'];
const HEADING_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const satisfies Record<HeadingLevel, keyof HTMLElementTagNameMap>;
const isLevel =validators.integerInRange(1, 6);
const isLines = validators.integerInRange(1, 20);

function fail(helper: string, property: string, expected: string): never {
  throw configurationError('TYPOGRAPHY_OPTIONS', 'Invalid typography options.', { component: 'typography', property: `typography.${helper}.${property}`, expected });
}

function checkText(helper: string, text: unknown): void {
  if (typeof text !== 'string' || text.trim() === '') fail(helper, 'text', 'non-empty string');
}

function checkHeadingSize(size: HeadingLevel | undefined): void {
  if (size !== undefined && !isLevel(size)) fail('heading', 'size', LEVEL_EXPECTED);
}

function checkTextOptions(options: TextEnhanceOptions): void {
  if (options.tone !== undefined && !TONES.includes(options.tone)) fail('text', 'tone', '"default" | "muted"');
  if (options.size !== undefined && !SIZES.includes(options.size)) fail('text', 'size', '"xs" | "sm" | "md" | "lg"');
  if (options.strong !== undefined && typeof options.strong !== 'boolean') fail('text', 'strong', 'boolean');
}

function textClasses(options: TextEnhanceOptions): string[] {
  const out = ['aui-text'];
  if (options.tone === 'muted') out.push('aui-text--muted');
  if (options.size !== undefined && options.size !== 'md') out.push(`aui-text--${options.size}`);
  if (options.strong) out.push('aui-text--strong');
  return out;
}

/** Replace the classes a helper added on an element (other classes stay). */
function swapClasses(el: Element, previous: readonly string[], next: readonly string[]): void {
  el.classList.remove(...previous.filter((c) => !next.includes(c)));
  el.classList.add(...next);
}

export const Heading = Object.freeze({
  /** Create `<h{level}>` styled at `size` (default: the level). The outline and the visual scale stay independent. */
  create(level: HeadingLevel, text: string, options: HeadingOptions = {}, doc: Document = document): HTMLHeadingElement {
    if (!isLevel(level)) fail('heading', 'level', LEVEL_EXPECTED);
    checkText('heading', text);
    if (options.size !== undefined && !isLevel(options.size)) fail('heading', 'size', LEVEL_EXPECTED);
    const el = doc.createElement(HEADING_TAGS[level]);
    el.className = `aui-heading aui-heading--${String(options.size ?? level)}`;
    el.textContent = text;
    return el;
  },
  /**
   * Style an existing `<h1>`..`<h6>` (since 0.9.0): the level comes from the tag, `size`
   * (default: the level) from the options. Its content is not touched.
   */
  enhance(el: HTMLHeadingElement, options: HeadingOptions = {}): TypographyEnhancement<HeadingOptions> {
    const level = Number(/^h([1-6])$/i.exec(el.tagName)?.[1]);
    if (!isLevel(level)) fail('heading', 'element', 'h1..h6 element');
    let applied: string[] = [];
    const apply = (o: HeadingOptions): void => {
      checkHeadingSize(o.size);
      const next = ['aui-heading', `aui-heading--${String(o.size ?? level)}`];
      swapClasses(el, applied, next);
      applied = next;
    };
    apply(options);
    return {
      update: apply,
      destroy: () => {
        el.classList.remove(...applied);
        applied = [];
      },
    };
  },
});

export const Text = Object.freeze({
  /** Create a text paragraph (or span) with token-based tone, size, and weight. */
  create(text: string, options: TextOptions = {}, doc: Document = document): HTMLParagraphElement | HTMLSpanElement {
    if (typeof text !== 'string') fail('text', 'text', 'string');
    if (options.tone !== undefined && !TONES.includes(options.tone)) fail('text', 'tone', '"default" | "muted"');
    if (options.size !== undefined && !SIZES.includes(options.size)) fail('text', 'size', '"xs" | "sm" | "md" | "lg"');
    if (options.strong !== undefined && typeof options.strong !== 'boolean') fail('text', 'strong', 'boolean');
    if (options.as !== undefined && !(['p', 'span'] as readonly unknown[]).includes(options.as)) fail('text', 'as', '"p" | "span"');
    const el = options.as === 'span' ? doc.createElement('span') : doc.createElement('p');
    el.classList.add('aui-text');
    if (options.tone === 'muted') el.classList.add('aui-text--muted');
    if (options.size !== undefined && options.size !== 'md') el.classList.add(`aui-text--${options.size}`);
    if (options.strong) el.classList.add('aui-text--strong');
    el.textContent = text;
    return el;
  },
  /** Style an existing text element (since 0.9.0) with `aui-text` modifiers. Its content is not touched. */
  enhance(el: HTMLElement, options: TextEnhanceOptions = {}): TypographyEnhancement<TextEnhanceOptions> {
    let applied: string[] = [];
    const apply = (o: TextEnhanceOptions): void => {
      checkTextOptions(o);
      const next = textClasses(o);
      swapClasses(el, applied, next);
      applied = next;
    };
    apply(options);
    return {
      update: apply,
      destroy: () => {
        el.classList.remove(...applied);
        applied = [];
      },
    };
  },
});

export const Link = Object.freeze({
  /** Create a validated `<a class="aui-link">`. */
  create(options: LinkOptions, doc: Document = document): HTMLAnchorElement {
    if (!isSafeHref(options.href)) fail('link', 'href', 'http(s) URL or relative reference (javascript:, data:, and other schemes are rejected)');
    checkText('link', options.text);
    if (options.external !== undefined && typeof options.external !== 'boolean') fail('link', 'external', 'boolean');
    if (options.muted !== undefined && typeof options.muted !== 'boolean') fail('link', 'muted', 'boolean');
    const { locale } = typographyConfig.resolve(options.locale === undefined ? {} : { locale: options.locale });
    const a = doc.createElement('a');
    a.className = options.muted ? 'aui-link aui-link--muted' : 'aui-link';
    a.href = options.href;
    a.textContent = options.text;
    if (options.external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const hint = doc.createElement('span');
      hint.className = 'aui-link__hint';
      // The leading space keeps the accessible name readable: "Docs (opens in a new tab)".
      hint.textContent = ` ${getMessage('typography', 'opensInNewTab', {}, locale)}`;
      a.append(hint);
    }
    return a;
  },
  /**
   * Style an existing link (since 0.9.0). Its href (from markup or a router) is validated like
   * `Link.create` when present; `external` sets `target` and `rel` and appends the hint, and
   * `destroy()` restores what it changed. Its own content is not touched.
   */
  enhance(a: HTMLAnchorElement, options: LinkEnhanceOptions = {}): TypographyEnhancement<LinkEnhanceOptions> & { check(): void } {
    const doc = a.ownerDocument;
    const saved = { target: a.getAttribute('target'), rel: a.getAttribute('rel') };
    let hint: HTMLSpanElement | null = null;
    let current = options;
    const check = (): void => {
      const href = a.getAttribute('href');
      if (href !== null && !isSafeHref(href)) fail('link', 'href', 'http(s) URL or relative reference (javascript:, data:, and other schemes are rejected)');
    };
    const restore = (name: 'target' | 'rel'): void => {
      const value = saved[name];
      if (value === null) a.removeAttribute(name);
      else a.setAttribute(name, value);
    };
    const apply = (o: LinkEnhanceOptions): void => {
      if (o.external !== undefined && typeof o.external !== 'boolean') fail('link', 'external', 'boolean');
      if (o.muted !== undefined && typeof o.muted !== 'boolean') fail('link', 'muted', 'boolean');
      check();
      current = o;
      a.classList.add('aui-link');
      a.classList.toggle('aui-link--muted', o.muted === true);
      if (o.external) {
        const { locale } = typographyConfig.resolve(o.locale === undefined ? {} : { locale: o.locale });
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        if (!hint) {
          hint = doc.createElement('span');
          hint.className = 'aui-link__hint';
          a.append(hint);
        }
        hint.textContent = ` ${getMessage('typography', 'opensInNewTab', {}, locale)}`;
      } else {
        restore('target');
        restore('rel');
        hint?.remove();
        hint = null;
      }
    };
    apply(options);
    return {
      update: (o) => {
        apply({ ...current, ...o });
      },
      /** Validate the href again (for example after a router changed it). */
      check,
      destroy: () => {
        a.classList.remove('aui-link', 'aui-link--muted');
        restore('target');
        restore('rel');
        hint?.remove();
        hint = null;
      },
    };
  },
});

/**
 * Clamp an element's text to `lines` lines (integer 1..20) with an ellipsis.
 * Returns a disposer that removes the class and custom property it added.
 */
export function setLineClamp(el: HTMLElement, lines: number): Disposer {
  if (!isLines(lines)) fail('lineClamp', 'lines', 'integer 1..20');
  const styles = new AppliedStyles(el);
  styles.setClass(['aui-line-clamp'], 'aui-line-clamp');
  styles.setProperty('--aui-lines', String(lines));
  return () => {
    styles.restore();
  };
}
