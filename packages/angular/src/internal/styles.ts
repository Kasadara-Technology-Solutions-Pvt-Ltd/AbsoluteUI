/**
 * Component CSS for attribute directives (docs/PLAN-R9-ANGULAR.md D10). Element
 * components carry their CSS in `styleUrls`; directives cannot, so each one loads a
 * style-only component once per application (the technique the Angular CDK uses).
 * Angular then handles deduplication, CSP nonces, and server rendering of the styles.
 */
import { ApplicationRef, createComponent, EnvironmentInjector, inject, Injectable, type ComponentRef, type Type } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuiStyleLoader {
  readonly #app = inject(ApplicationRef);
  readonly #injector = inject(EnvironmentInjector);
  readonly #loaded = new Map<Type<unknown>, ComponentRef<unknown>>();

  constructor() {
    this.#app.onDestroy(() => {
      for (const ref of this.#loaded.values()) ref.destroy();
      this.#loaded.clear();
    });
  }

  load(styles: Type<unknown>): void {
    if (this.#loaded.has(styles)) return;
    this.#loaded.set(styles, createComponent(styles, { environmentInjector: this.#injector }));
  }
}

/** Load a style-only component; call from a directive constructor (injection context). */
export function loadStyles(styles: Type<unknown>): void {
  inject(AuiStyleLoader).load(styles);
}
