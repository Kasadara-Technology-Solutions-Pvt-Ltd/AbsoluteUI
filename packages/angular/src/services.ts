/**
 * Angular platform services (docs/PLAN-R9-ANGULAR.md M1). They adapt the injector's
 * configuration scope and the rendering platform to the framework-neutral contracts.
 */
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, type Signal } from '@angular/core';
import type { AnimationMode, Density, Direction, Disambiguation } from '@absoluteui/core';
import { registerIcons, setIconProvider, type IconDefinition, type IconProvider } from '@absoluteui/icons';
import { AuiConfig } from './config.js';

/** Runtime capabilities. On the server, `window` is null and browser-only features report false. */
@Injectable({ providedIn: 'root' })
export class AuiPlatform {
  readonly isBrowser: boolean = isPlatformBrowser(inject(PLATFORM_ID));
  readonly isServer: boolean = !this.isBrowser;
  readonly document: Document = inject(DOCUMENT);
  readonly window: (Window & typeof globalThis) | null = this.isBrowser ? this.document.defaultView : null;

  /** Whether a browser API is available (always false on the server). */
  supports(feature: 'ResizeObserver' | 'IntersectionObserver' | 'MutationObserver' | 'matchMedia'): boolean {
    const win = this.window;
    return win !== null && typeof win[feature] === 'function';
  }
}

/** Locale settings of the current configuration scope. */
@Injectable({ providedIn: 'root', useFactory: () => new AuiLocale(inject(AuiConfig)) })
export class AuiLocale {
  readonly locale: Signal<string>;
  /** IANA time zone (default `'UTC'`, never the host zone). */
  readonly timezone: Signal<string>;
  readonly disambiguation: Signal<Disambiguation>;

  /** @internal Provided with each configuration scope; inject it instead. */
  constructor(config: AuiConfig) {
    this.locale = computed(() => config.common().locale);
    this.timezone = computed(() => config.common().timezone);
    this.disambiguation = computed(() => config.common().disambiguation);
  }
}

/** Text direction of the current configuration scope. */
@Injectable({ providedIn: 'root', useFactory: () => new AuiDirectionality(inject(AuiConfig)) })
export class AuiDirectionality {
  readonly value: Signal<Direction>;

  /** @internal Provided with each configuration scope; inject it instead. */
  constructor(config: AuiConfig) {
    this.value = computed(() => config.common().direction);
  }
}

/** Application theme, density, and animation mode (applied to the document element). */
@Injectable({ providedIn: 'root' })
export class AuiTheme {
  readonly #config = inject(AuiConfig);
  readonly theme: Signal<string> = computed(() => this.#config.common().theme);
  readonly density: Signal<Density> = computed(() => this.#config.common().density);
  readonly animation: Signal<AnimationMode> = computed(() => this.#config.common().animation);

  /** Switch the application theme (a built-in name or one registered with `registerTheme`). */
  setTheme(theme: string): void {
    this.#config.patch({ theme });
  }

  /** Switch the density (compact, comfortable, or spacious) for this configuration scope. */
  setDensity(density: Density): void {
    this.#config.patch({ density });
  }

  /** Switch animations ('subtle' or 'none') for this configuration scope. */
  setAnimation(animation: AnimationMode): void {
    this.#config.patch({ animation });
  }
}

/** Icon registry and provider (application-wide). */
@Injectable({ providedIn: 'root' })
export class AuiIcons {
  /** Add or replace named icons. */
  register(icons: Readonly<Record<string, IconDefinition>>): void {
    registerIcons(icons);
  }

  /** Resolve icon names through an icon library adapter (`null` restores the registry). */
  setProvider(provider: IconProvider | null): void {
    setIconProvider(provider);
  }
}

/**
 * Unique element ids. Ids are generated in creation order, so server rendering and
 * the client produce the same sequence for the same view tree.
 */
@Injectable({ providedIn: 'root' })
export class AuiIds {
  #next = 0;

  /** The next unique id, for example `aui-3`. */
  next(prefix = 'aui'): string {
    this.#next += 1;
    return `${prefix}-${String(this.#next)}`;
  }
}
