import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID, type OnDestroy, type Provider } from '@angular/core';
import { Toaster, type ToastHandle, type ToastOptions, type ToasterOptions } from '@absoluteui/components/toast';
import { ToastStyles } from '../internal/style-sheets.js';
import { AuiStyleLoader } from '../internal/styles.js';

/** Toaster options token; set it with `provideAuiToaster`. */
export const AUI_TOASTER_OPTIONS = new InjectionToken<ToasterOptions>('AUI_TOASTER_OPTIONS');

/** Configure the application toaster (position, max, duration, hotkey). */
export function provideAuiToaster(options: ToasterOptions): Provider {
  return { provide: AUI_TOASTER_OPTIONS, useValue: options };
}

/**
 * Angular service for Toast notifications:
 * `inject(AuiToaster).show({ tone: 'success', message: 'Saved' })`.
 * The toaster region is created lazily in the browser; on the server `show()`
 * returns null and renders nothing.
 */
@Injectable({ providedIn: 'root' })
export class AuiToaster implements OnDestroy {
  readonly #options = inject(AUI_TOASTER_OPTIONS, { optional: true }) ?? {};
  readonly #doc = inject(DOCUMENT);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #styles = inject(AuiStyleLoader);
  #toaster: Toaster | null = null;

  /** Show a toast; returns its handle (dismiss, update), or null on the server. */
  show(options: ToastOptions): ToastHandle | null {
    if (!this.#browser) return null;
    this.#styles.load(ToastStyles);
    this.#toaster ??= Toaster.create(this.#options, this.#doc);
    return this.#toaster.show(options);
  }

  /** Dismiss every toast. */
  clear(): void {
    this.#toaster?.clear();
  }

  ngOnDestroy(): void {
    this.#toaster?.destroy();
    this.#toaster = null;
  }
}
