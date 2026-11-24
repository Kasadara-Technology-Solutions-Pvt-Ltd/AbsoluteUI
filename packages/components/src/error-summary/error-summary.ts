/**
 * Error Summary (SPEC section 18.8, accessible error navigation). Lists every error
 * after a failed submission as links that move focus to the offending field
 * (GOV.UK error summary pattern). The summary receives focus when shown, so
 * screen readers announce its heading and contents once, without a live region.
 */
import { configurationError, createId, defineComponentConfig, emit, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';

export type HeadingLevel = 2 | 3 | 4;

export interface ErrorSummaryConfig {
  headingLevel: HeadingLevel;
  focusOnShow: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    errorSummary: ErrorSummaryConfig & { locale: string };
  }
}

export const errorSummaryConfig = defineComponentConfig<ErrorSummaryConfig, 'locale'>(
  'errorSummary',
  {
    headingLevel: { default: 2, expected: '2 | 3 | 4', validate: validators.oneOf([2, 3, 4] as const) },
    focusOnShow: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('errorSummary', 'en', { title: 'There is a problem' });

export interface ErrorSummaryItem {
  /** Message text (never parsed as HTML). */
  readonly message: string;
  /** Element to navigate to. Items without a target render as plain text. */
  readonly target?: HTMLElement | null;
  /** Custom focus behavior, e.g. a component's `focus()`. Default: focus the target. */
  readonly focus?: () => void;
}

export interface ErrorSummaryIcons {
  error: IconRef;
}

export interface ErrorSummaryOptions extends Partial<ErrorSummaryConfig> {
  /** Heading text. Default: localized "There is a problem". */
  title?: string;
  /** Optional text shown under the heading. */
  description?: string;
  locale?: string;
  icons?: Partial<ErrorSummaryIcons>;
}

export interface ErrorSummaryNavigateDetail {
  index: number;
  message: string;
}

const HEADING_TAGS = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

export class ErrorSummary {
  readonly host: HTMLElement;
  #options: ErrorSummaryOptions;
  #items: readonly ErrorSummaryItem[] = [];
  readonly #doc: Document;
  #heading: HTMLHeadingElement;
  readonly #headingId = createId('aui-error-summary-title');
  readonly #headingText: HTMLSpanElement;
  readonly #description: HTMLParagraphElement;
  readonly #list: HTMLUListElement;
  readonly #unsubscribe: () => void;

  /** Render into `host` (children are replaced). Hidden until `show()`. */
  static create(host: HTMLElement, options: ErrorSummaryOptions = {}): ErrorSummary {
    return new ErrorSummary(host, options);
  }

  private constructor(host: HTMLElement, options: ErrorSummaryOptions) {
    this.#doc = host.ownerDocument;
    this.host = host;
    this.#options = { ...options };
    this.#config();
    const doc = this.#doc;
    this.#heading = doc.createElement('h2');
    this.#headingText = doc.createElement('span');
    this.#description = doc.createElement('p');
    this.#description.className = 'aui-error-summary__description';
    this.#list = doc.createElement('ul');
    this.#list.className = 'aui-error-summary__list';
    host.classList.add('aui-error-summary');
    host.tabIndex = -1;
    host.setAttribute('role', 'region');
    host.setAttribute('aria-labelledby', this.#headingId);
    host.replaceChildren(this.#heading, this.#description, this.#list);
    host.hidden = true;
    this.#render();
    this.#unsubscribe = errorSummaryConfig.subscribe(() => {
      this.#render();
    });
  }

  get items(): readonly ErrorSummaryItem[] {
    return this.#items;
  }

  get isVisible(): boolean {
    return !this.host.hidden;
  }

  /**
   * Show the given errors. An empty list hides the summary. Focus moves to the
   * summary unless `focus: false` or the `focusOnShow` configuration is false.
   */
  show(items: readonly ErrorSummaryItem[], options: { focus?: boolean } = {}): void {
    for (const [i, item] of items.entries()) {
      if (typeof item.message !== 'string' || item.message === '') {
        throw configurationError('ERROR_SUMMARY_ITEM', 'Invalid error summary item.', { component: 'errorSummary', property: `items[${i}].message`, expected: 'non-empty string' });
      }
    }
    this.#items = [...items];
    this.#renderItems();
    this.host.hidden = items.length === 0;
    if (items.length > 0 && (options.focus ?? this.#config().focusOnShow)) {
      this.host.focus();
      this.host.scrollIntoView({ block: 'nearest' });
    }
  }

  clear(): void {
    this.show([], { focus: false });
  }

  update(options: Partial<ErrorSummaryOptions>): void {
    const previous = this.#options;
    this.#options = { ...previous, ...options };
    try {
      this.#config();
    } catch (e) {
      this.#options = previous;
      throw e;
    }
    this.#render();
  }

  destroy(): void {
    this.#unsubscribe();
    this.host.replaceChildren();
    this.host.classList.remove('aui-error-summary');
    this.host.removeAttribute('tabindex');
    this.host.removeAttribute('role');
    this.host.removeAttribute('aria-labelledby');
    this.host.hidden = false;
  }

  #config(): Readonly<ErrorSummaryConfig & { locale: string }> {
    const o = this.#options;
    return errorSummaryConfig.resolve({
      ...(o.headingLevel === undefined ? {} : { headingLevel: o.headingLevel }),
      ...(o.focusOnShow === undefined ? {} : { focusOnShow: o.focusOnShow }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #render(): void {
    const config = this.#config();
    const o = this.#options;
    // Native heading element of the configured level (SPEC section 13.3: semantic HTML first).
    const tag = HEADING_TAGS[config.headingLevel];
    if (this.#heading.localName !== tag) {
      const next = this.#doc.createElement(tag);
      this.#heading.replaceWith(next);
      this.#heading = next;
    }
    this.#heading.className = 'aui-error-summary__title';
    this.#heading.id = this.#headingId;
    this.#headingText.textContent = o.title ?? getMessage('errorSummary', 'title', {}, config.locale);
    this.#heading.replaceChildren(renderIcon(o.icons?.error ?? 'alert-circle', { className: 'aui-error-summary__icon', doc: this.#doc }), this.#headingText);
    this.#description.textContent = o.description ?? '';
    this.#description.hidden = !o.description;
  }

  #renderItems(): void {
    const doc = this.#doc;
    const lis = this.#items.map((item, index) => {
      const li = doc.createElement('li');
      const target = item.target ?? null;
      if (!target) {
        li.textContent = item.message;
        return li;
      }
      if (!target.id) target.id = createId('aui-field');
      const a = doc.createElement('a');
      a.className = 'aui-error-summary__link';
      a.href = `#${target.id}`;
      a.textContent = item.message;
      a.addEventListener('click', (event) => {
        event.preventDefault();
        if (item.focus) item.focus();
        else target.focus();
        target.scrollIntoView({ block: 'center' });
        emit(this.host, 'aui-navigate', { index, message: item.message } satisfies ErrorSummaryNavigateDetail);
      });
      li.append(a);
      return li;
    });
    this.#list.replaceChildren(...lis);
  }
}
