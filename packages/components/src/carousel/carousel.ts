/**
 * Carousel (R13-6). Shows one slide at a time from a set (featured items, an
 * onboarding tour, image sets), following the WAI-ARIA APG carousel pattern: a named
 * region with roledescription "carousel", slides as groups labelled "N of M",
 * previous/next buttons and slide pickers, and inactive slides made inert. No
 * autoplay by default; when autoplay is on, a pause button comes first, rotation
 * pauses on hover and focus, and it never starts for users who prefer reduced motion.
 */
import { configurationError, defineComponentConfig, emit, formatNumber, getCommonConfig, getMessage, registerMessages, validators, DisposableGroup } from '@absoluteui/core';
import { Button } from '../button/button.js';

export interface CarouselConfig {
  /** Show the slide picker buttons. */
  showPicker: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    carousel: CarouselConfig & { locale: string };
  }
}

export const carouselConfig = defineComponentConfig<CarouselConfig, 'locale'>(
  'carousel',
  { showPicker: { default: true, expected: 'boolean', validate: validators.isBoolean } },
  ['locale'],
);

registerMessages('carousel', 'en', {
  carousel: 'carousel',
  slide: 'slide',
  slideOf: '{index} of {count}',
  previous: 'Previous slide',
  next: 'Next slide',
  goTo: 'Go to slide {index}',
  slides: 'Slides',
  pause: 'Pause',
  play: 'Play',
  pauseLabel: 'Stop automatic slide show',
  playLabel: 'Start automatic slide show',
});

export interface CarouselSlide {
  /** Slide content. Strings are rendered as text, never parsed as HTML. */
  content: Node | string;
  /** Slide name, added to "N of M" (for example "Spring sale"). */
  label?: string;
}

export interface CarouselOptions extends Partial<CarouselConfig> {
  /** Accessible name of the carousel, such as "Featured products". */
  label: string;
  slides: readonly CarouselSlide[];
  /** Current slide (0-based). Default 0. */
  index?: number;
  /** Wrap from the last slide to the first and back. Default false. */
  loop?: boolean;
  /** Rotate every so many milliseconds (at least 2000), or null for no rotation. Default null. */
  autoplay?: number | null;
  locale?: string;
}

/** `aui-change` detail: the slide the user moved to. */
export interface CarouselChangeDetail {
  index: number;
}

const MIN_INTERVAL = 2000;
const SWIPE = 40;

export class Carousel {
  readonly host: HTMLElement;
  #options: CarouselOptions;
  #index: number;
  readonly #doc: Document;
  readonly #viewport: HTMLDivElement;
  readonly #track: HTMLDivElement;
  readonly #controls: HTMLDivElement;
  readonly #picker: HTMLDivElement;
  readonly #prev: Button;
  readonly #next: Button;
  readonly #pause: Button;
  #slides: HTMLDivElement[] = [];
  #dots: Button[] = [];
  #builtSlides: readonly CarouselSlide[] | null = null;
  /** Listeners of the current slide pickers, released when the slides are rebuilt. */
  #dotGroup = new DisposableGroup();
  /** The user paused rotation (pause button); hover and focus pause it temporarily. */
  #stopped: boolean;
  #hover = false;
  #focusWithin = false;
  #timer: ReturnType<typeof setInterval> | null = null;
  #swipe: { id: number; x: number } | null = null;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: CarouselOptions): Carousel {
    return new Carousel(host, options);
  }

  private constructor(host: HTMLElement, options: CarouselOptions) {
    Carousel.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#index = Math.min(options.index ?? 0, options.slides.length - 1);
    const view = this.#doc.defaultView;
    // Users who prefer reduced motion start with rotation stopped (they can still start it).
    this.#stopped = view?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? true;
    const doc = this.#doc;
    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-carousel__viewport';
    this.#track = doc.createElement('div');
    this.#track.className = 'aui-carousel__track';
    this.#viewport.append(this.#track);
    this.#controls = doc.createElement('div');
    this.#controls.className = 'aui-carousel__controls';
    this.#picker = doc.createElement('div');
    this.#picker.className = 'aui-carousel__picker';
    this.#picker.setAttribute('role', 'group');
    const button = (className: string): HTMLButtonElement => {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = className;
      return el;
    };
    const pauseEl = button('aui-carousel__pause');
    const prevEl = button('aui-carousel__prev');
    const nextEl = button('aui-carousel__next');
    // Labels are set in #render; placeholders satisfy the icon-only name check.
    prevEl.setAttribute('aria-label', '-');
    nextEl.setAttribute('aria-label', '-');
    this.#pause = Button.enhance(pauseEl, { variant: 'ghost', size: 'sm' });
    this.#prev = Button.enhance(prevEl, { icon: 'chevron-left', variant: 'outline', size: 'sm' });
    this.#next = Button.enhance(nextEl, { icon: 'chevron-right', variant: 'outline', size: 'sm' });
    // The pause button comes first in the tab order (APG); it is hidden without autoplay.
    this.#controls.append(prevEl, this.#picker, nextEl);

    // Render first: invalid options (including config and messages) throw before the host is touched.
    this.#render();
    host.classList.add('aui-carousel');
    host.setAttribute('role', 'region');
    host.replaceChildren(pauseEl, this.#viewport, this.#controls);

    this.#group.listen(prevEl, 'click', () => {
      this.#go(this.#index - 1, true);
    });
    this.#group.listen(nextEl, 'click', () => {
      this.#go(this.#index + 1, true);
    });
    this.#group.listen(pauseEl, 'click', () => {
      this.#stopped = !this.#stopped;
      this.#render();
    });
    this.#group.listen(host, 'pointerenter', () => {
      this.#hover = true;
      this.#schedule();
    });
    this.#group.listen(host, 'pointerleave', () => {
      this.#hover = false;
      this.#schedule();
    });
    this.#group.listen(host, 'focusin', () => {
      this.#focusWithin = true;
      this.#schedule();
    });
    this.#group.listen(host, 'focusout', (event) => {
      this.#focusWithin = event.relatedTarget instanceof Node && host.contains(event.relatedTarget);
      this.#schedule();
    });
    this.#group.listen(this.#viewport, 'pointerdown', (event) => {
      if (event.pointerType !== 'mouse') this.#swipe = { id: event.pointerId, x: event.clientX };
    });
    this.#group.listen(this.#viewport, 'pointerup', (event) => {
      const swipe = this.#swipe;
      this.#swipe = null;
      if (swipe?.id !== event.pointerId) return;
      const dx = event.clientX - swipe.x;
      if (Math.abs(dx) < SWIPE) return;
      // A leftward swipe shows the next slide (rightward in right-to-left layouts).
      const forward = getComputedStyle(this.host).direction === 'rtl' ? dx > 0 : dx < 0;
      this.#go(this.#index + (forward ? 1 : -1), true);
    });
    this.#group.listen(this.#viewport, 'pointercancel', () => {
      this.#swipe = null;
    });
    this.#group.add(carouselConfig.subscribe(() => {
      this.#render();
    }));
    this.#group.add(() => {
      this.#clearTimer();
    });
  }

  get options(): Readonly<CarouselOptions> {
    return this.#options;
  }

  /** Current slide (0-based). */
  get index(): number {
    return this.#index;
  }

  /** Whether automatic rotation is running now. */
  get rotating(): boolean {
    return this.#timer !== null;
  }

  /** Show a slide (no event). Out-of-range indexes are clamped (or wrapped with loop). */
  goTo(index: number): void {
    this.#go(index, false);
  }

  next(): void {
    this.#go(this.#index + 1, false);
  }

  previous(): void {
    this.#go(this.#index - 1, false);
  }

  update(options: Partial<CarouselOptions>): void {
    const next = { ...this.#options, ...options };
    Carousel.#assert(next);
    const previous = { options: this.#options, index: this.#index };
    this.#options = next;
    if (options.index !== undefined) this.#index = options.index;
    this.#index = Math.min(this.#index, next.slides.length - 1);
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#index = previous.index;
      this.#render();
      throw error;
    }
  }

  destroy(): void {
    this.#group.dispose();
    this.#prev.destroy();
    this.#next.destroy();
    this.#pause.destroy();
    for (const dot of this.#dots) dot.destroy();
    this.#dotGroup.dispose();
    this.host.replaceChildren();
    for (const name of ['role', 'aria-roledescription', 'aria-label']) this.host.removeAttribute(name);
    this.host.classList.remove('aui-carousel', 'aui-carousel--autoplay');
  }

  static #assert(options: CarouselOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('CAROUSEL_OPTIONS', 'Invalid carousel options.', { component: 'carousel', property: `carousel.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const slides: unknown = options.slides;
    if (!Array.isArray(slides) || slides.length === 0 || slides.length > 100) fail('slides', '1 to 100 slides { content, label? }');
    for (const slide of options.slides) {
      const content: unknown = slide.content;
      if (typeof content !== 'string' && !(content instanceof Node)) fail('slides', 'content: Node | string for every slide');
    }
    const index: unknown = options.index;
    if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= options.slides.length)) fail('index', 'an integer index of a slide');
    const autoplay: unknown = options.autoplay;
    if (autoplay != null && (typeof autoplay !== 'number' || !Number.isFinite(autoplay) || autoplay < MIN_INTERVAL)) fail('autoplay', `null or milliseconds (at least ${String(MIN_INTERVAL)})`);
  }

  #target(index: number): number {
    const count = this.#options.slides.length;
    if (this.#options.loop === true) return ((index % count) + count) % count;
    return Math.min(count - 1, Math.max(0, index));
  }

  #go(index: number, user: boolean): void {
    const target = this.#target(index);
    if (target === this.#index) return;
    this.#index = target;
    this.host.classList.add('aui-carousel--animated');
    this.#render();
    if (user) emit(this.host, 'aui-change', { index: target } satisfies CarouselChangeDetail);
  }

  /** Build the slides off-document when they change. */
  #buildSlides(locale: string): void {
    const o = this.#options;
    if (this.#builtSlides === o.slides) return;
    const count = o.slides.length;
    this.#slides = o.slides.map((slide, i) => {
      const el = this.#doc.createElement('div');
      el.className = 'aui-carousel__slide';
      el.setAttribute('role', 'group');
      el.setAttribute('aria-roledescription', getMessage('carousel', 'slide', {}, locale));
      const position = getMessage('carousel', 'slideOf', { index: formatNumber(i + 1, {}, locale), count: formatNumber(count, {}, locale) }, locale);
      el.setAttribute('aria-label', slide.label ? `${position}: ${slide.label}` : position);
      el.append(typeof slide.content === 'string' ? this.#doc.createTextNode(slide.content) : slide.content);
      return el;
    });
    this.#track.replaceChildren(...this.#slides);
    for (const dot of this.#dots) dot.destroy();
    this.#dotGroup.dispose();
    this.#dotGroup = new DisposableGroup();
    this.#dots = o.slides.map((_, i) => {
      const el = this.#doc.createElement('button');
      el.type = 'button';
      el.className = 'aui-carousel__dot';
      el.setAttribute('aria-label', getMessage('carousel', 'goTo', { index: formatNumber(i + 1, {}, locale) }, locale));
      this.#dotGroup.listen(el, 'click', () => {
        this.#go(i, true);
      });
      return Button.enhance(el, { variant: 'ghost', size: 'sm' });
    });
    this.#picker.replaceChildren(...this.#dots.map((d) => d.element));
    this.#builtSlides = o.slides;
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, messages) runs before the DOM is changed.
    const { showPicker, locale } = carouselConfig.resolve({
      ...(o.showPicker === undefined ? {} : { showPicker: o.showPicker }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
    const m = (id: string, params: Record<string, string> = {}): string => getMessage('carousel', id, params, locale);
    const labels = { roledescription: m('carousel'), previous: m('previous'), next: m('next'), slides: m('slides'), pause: m('pause'), play: m('play'), pauseLabel: m('pauseLabel'), playLabel: m('playLabel') };
    this.#buildSlides(locale);

    const host = this.host;
    const count = o.slides.length;
    const autoplay = o.autoplay ?? null;
    host.setAttribute('aria-roledescription', labels.roledescription);
    host.setAttribute('aria-label', o.label);
    host.classList.toggle('aui-carousel--autoplay', autoplay !== null);
    this.#track.style.setProperty('--_aui-carousel-index', String(this.#index));
    // Announce slide changes, except while rotating automatically (APG).
    this.#viewport.setAttribute('aria-live', autoplay !== null && !this.#stopped ? 'off' : 'polite');
    for (const [i, slide] of this.#slides.entries()) {
      const current = i === this.#index;
      // Hidden slides cannot take focus or be read out of place.
      slide.inert = !current;
      slide.classList.toggle('aui-carousel__slide--current', current);
    }
    for (const [i, dot] of this.#dots.entries()) {
      const current = i === this.#index;
      if (current) dot.element.setAttribute('aria-current', 'true');
      else dot.element.removeAttribute('aria-current');
      dot.element.classList.toggle('aui-carousel__dot--current', current);
    }
    this.#picker.setAttribute('aria-label', labels.slides);
    this.#picker.hidden = !showPicker || count < 2;
    const loop = o.loop === true;
    this.#prev.element.setAttribute('aria-label', labels.previous);
    this.#next.element.setAttribute('aria-label', labels.next);
    this.#prev.update({ label: labels.previous, disabled: !loop && this.#index === 0 });
    this.#next.update({ label: labels.next, disabled: !loop && this.#index === count - 1 });
    this.#controls.hidden = count < 2;
    const pauseEl = this.#pause.element;
    pauseEl.hidden = autoplay === null;
    pauseEl.textContent = this.#stopped ? labels.play : labels.pause;
    pauseEl.setAttribute('aria-label', this.#stopped ? labels.playLabel : labels.pauseLabel);
    this.#pause.update({});
    this.#schedule();
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  /** Rotate only with autoplay on, not stopped, and while the user is not hovering or focused inside. */
  #schedule(): void {
    const autoplay = this.#options.autoplay ?? null;
    const run = autoplay !== null && !this.#stopped && !this.#hover && !this.#focusWithin && this.#options.slides.length > 1 && getCommonConfig().animation !== 'none';
    if (!run) {
      this.#clearTimer();
      return;
    }
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => {
      const count = this.#options.slides.length;
      this.#go((this.#index + 1) % count, false);
    }, autoplay);
  }
}
