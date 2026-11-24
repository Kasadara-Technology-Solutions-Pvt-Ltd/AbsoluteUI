import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, PLATFORM_ID, ViewEncapsulation, type InputSignal } from '@angular/core';
import {
  animateIcon,
  renderIcon,
  updateIcon,
  type IconAnimationController,
  type IconAnimationOptions,
  type IconAnimationState,
  type IconColorRole,
  type IconLayerName,
  type IconLayerOverride,
  type IconOverlayPlacement,
  type IconRef,
  type IconSize,
  type IconVariantName,
  type UpdateIconOptions,
} from '@absoluteui/icons';
import { completeServerDom } from '../internal/server-dom.js';

/** Role colors for one icon instance. */
export type AuiIconColors = Readonly<Partial<Record<IconColorRole, string>>>;
/** Per-layer color, opacity, or visibility for one icon instance. */
export type AuiIconLayers = Readonly<Partial<Record<IconLayerName, IconLayerOverride>>>;
/** Animation of an `aui-icon`; `host` defaults to the `aui-icon` element (hover, focus, and press triggers). */
export type AuiIconAnimation = IconAnimationOptions;

interface Snapshot {
  readonly name: IconRef;
  readonly size: IconSize | number | undefined;
  readonly label: string | undefined;
  readonly variant: IconVariantName | undefined;
  readonly colors: AuiIconColors | undefined;
  readonly layers: AuiIconLayers | undefined;
  readonly overlays: readonly IconOverlayPlacement[] | undefined;
  readonly container: 'circle' | 'square' | undefined;
  readonly strokeWidth: number | undefined;
  readonly strokeScaling: 'scale' | 'fixed' | undefined;
  readonly rotate: 0 | 90 | 180 | 270 | undefined;
  readonly flip: 'horizontal' | 'vertical' | 'both' | undefined;
  readonly dir: 'auto' | 'ltr' | 'rtl' | undefined;
  readonly animation: AuiIconAnimation | undefined;
  readonly animationState: IconAnimationState | undefined;
}

/** Inputs that change the shapes: a change renders the icon again. */
const STRUCTURAL = ['name', 'variant', 'overlays', 'container', 'strokeScaling', 'rotate', 'flip', 'dir'] as const;

/**
 * AbsoluteUI icon outlet: `<aui-icon name="calendar" size="sm" />`.
 * `name` is a registered icon name, a name resolved by the icon provider
 * (`provideAbsoluteUI({ icons })`), or an inline icon definition such as an icon of
 * `@absoluteui/icons/set`. Decorative unless `label` is set. Vector icons also take
 * `variant`, `colors`, `layers`, `overlays`, `container`, stroke, transform, and
 * animation inputs: colors, layers, stroke width, size, label, and `animationState`
 * update the rendered icon in place; the other inputs render it again. Animations run
 * in the browser only (the server renders the static icon) and stop when the
 * component is destroyed.
 */
@Component({
  selector: 'aui-icon',
  exportAs: 'auiIcon',
  template: '',
  styles: ['@layer aui.base{:where(aui-icon){display:inline-flex;vertical-align:middle}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The icon is rendered outside Angular's template (server and browser alike).
  host: { ngSkipHydration: 'true' },
})
export class AuiIcon {
  /** Registered icon name, or an icon definition (an icon of `@absoluteui/icons/set`, or one from an icon library adapter). */
  readonly name: InputSignal<IconRef> = input.required<IconRef>();
  /** Theme size xs to xl, a CSS length such as '20px', or a number of pixels (default: the surrounding icon size, or 1em). */
  readonly size: InputSignal<IconSize | number | undefined> = input<IconSize | number>();
  /** Accessible name. Omit for decorative icons; label icon-only buttons on the button instead. */
  readonly label: InputSignal<string | undefined> = input<string>();
  /** Variant of a vector icon (default `'outline'`); the icon must provide it. */
  readonly variant: InputSignal<IconVariantName | undefined> = input<IconVariantName>();
  /** Role colors (CSS colors, validated), for example `{ accent: 'var(--aui-color-success-fg)' }`. */
  readonly colors: InputSignal<AuiIconColors | undefined> = input<AuiIconColors>();
  /** Per-layer overrides: `color`, `opacity`, `hidden`. */
  readonly layers: InputSignal<AuiIconLayers | undefined> = input<AuiIconLayers>();
  /** Up to two overlays (`@absoluteui/icons/set` overlays), one per anchor. */
  readonly overlays: InputSignal<readonly IconOverlayPlacement[] | undefined> = input<readonly IconOverlayPlacement[]>();
  /** Draws the icon inside a circle or square. */
  readonly container: InputSignal<'circle' | 'square' | undefined> = input<'circle' | 'square'>();
  /** Outline stroke width in icon units, 0.5 to 4 (default: the inherited `--aui-icon-stroke-width`, else 2). */
  readonly strokeWidth: InputSignal<number | undefined> = input<number>();
  /** `'fixed'` keeps strokes at their width in CSS pixels at any size. */
  readonly strokeScaling: InputSignal<'scale' | 'fixed' | undefined> = input<'scale' | 'fixed'>();
  readonly rotate: InputSignal<0 | 90 | 180 | 270 | undefined> = input<0 | 90 | 180 | 270>();
  readonly flip: InputSignal<'horizontal' | 'vertical' | 'both' | undefined> = input<'horizontal' | 'vertical' | 'both'>();
  /** `'auto'` (default) mirrors directional icons in right-to-left layouts; `'ltr'` or `'rtl'` force a direction. */
  readonly dir: InputSignal<'auto' | 'ltr' | 'rtl' | undefined> = input<'auto' | 'ltr' | 'rtl'>();
  /** An animation the icon lists (static by default; reduced motion is honored). */
  readonly animation: InputSignal<AuiIconAnimation | undefined> = input<AuiIconAnimation>();
  /** State for state-driven triggers: `loading`, `success`, and `error` play; `idle` stops. */
  readonly animationState: InputSignal<IconAnimationState | undefined> = input<IconAnimationState>();

  readonly #host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  #icon: Element | undefined;
  #controller: IconAnimationController | undefined;
  #last: Snapshot | undefined;

  constructor() {
    if (!this.#browser) completeServerDom(this.#host.ownerDocument);
    inject(DestroyRef).onDestroy(() => {
      this.#stopAnimation();
    });
    effect(() => {
      const next: Snapshot = {
        name: this.name(),
        size: this.size(),
        label: this.label(),
        variant: this.variant(),
        colors: this.colors(),
        layers: this.layers(),
        overlays: this.overlays(),
        container: this.container(),
        strokeWidth: this.strokeWidth(),
        strokeScaling: this.strokeScaling(),
        rotate: this.rotate(),
        flip: this.flip(),
        dir: this.dir(),
        animation: this.animation(),
        animationState: this.animationState(),
      };
      const prev = this.#last;
      this.#last = next;
      // A value that goes back to undefined cannot be removed in place: render again.
      const reset = prev !== undefined && ((prev.size !== undefined && next.size === undefined) || (prev.strokeWidth !== undefined && next.strokeWidth === undefined));
      if (prev === undefined || this.#icon === undefined || reset || STRUCTURAL.some((key) => prev[key] !== next[key])) {
        this.#render(next);
        return;
      }
      const changes: UpdateIconOptions = {
        ...(prev.colors === next.colors ? {} : { colors: next.colors ?? {} }),
        ...(prev.layers === next.layers ? {} : { layers: next.layers ?? {} }),
        ...(prev.strokeWidth === next.strokeWidth || next.strokeWidth === undefined ? {} : { strokeWidth: next.strokeWidth }),
        ...(prev.size === next.size || next.size === undefined ? {} : { size: next.size }),
        ...(prev.label === next.label ? {} : { label: next.label ?? null }),
      };
      if (Object.keys(changes).length > 0) updateIcon(this.#icon, changes);
      if (prev.animation !== next.animation) this.#startAnimation(next);
      else if (prev.animationState !== next.animationState) this.#controller?.setState(next.animationState ?? 'idle');
    });
  }

  /** Plays the animation (for `manual` and `on-change` triggers). */
  play(): void {
    this.#controller?.play();
  }

  /** Stops the animation and shows the static end state. */
  stop(): void {
    this.#controller?.stop();
  }

  #render(s: Snapshot): void {
    this.#stopAnimation();
    const icon = renderIcon(s.name, {
      doc: this.#host.ownerDocument,
      ...(s.size === undefined ? {} : { size: s.size }),
      ...(s.label === undefined ? {} : { label: s.label }),
      ...(s.variant === undefined ? {} : { variant: s.variant }),
      ...(s.colors === undefined ? {} : { colors: s.colors }),
      ...(s.layers === undefined ? {} : { layers: s.layers }),
      ...(s.overlays === undefined ? {} : { overlays: s.overlays }),
      ...(s.container === undefined ? {} : { container: s.container }),
      ...(s.strokeWidth === undefined ? {} : { strokeWidth: s.strokeWidth }),
      ...(s.strokeScaling === undefined ? {} : { strokeScaling: s.strokeScaling }),
      ...(s.rotate === undefined ? {} : { rotate: s.rotate }),
      ...(s.flip === undefined ? {} : { flip: s.flip }),
      ...(s.dir === undefined ? {} : { dir: s.dir }),
    });
    this.#host.replaceChildren(icon);
    this.#icon = icon;
    this.#startAnimation(s);
  }

  #startAnimation(s: Snapshot): void {
    this.#stopAnimation();
    if (!this.#browser || s.animation === undefined || this.#icon === undefined) return;
    this.#controller = animateIcon(this.#icon, { host: this.#host, ...s.animation });
    if (s.animationState !== undefined) this.#controller.setState(s.animationState);
  }

  #stopAnimation(): void {
    this.#controller?.dispose();
    this.#controller = undefined;
  }
}
