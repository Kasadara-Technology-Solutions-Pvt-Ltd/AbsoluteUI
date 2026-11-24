import { Directive, input, type InputSignal } from '@angular/core';
import { ScrollArea, type ScrollAreaOptions } from '@absoluteui/components/scroll-area';
import { ComponentBridge, defined } from '../internal/bridge.js';
import { ScrollAreaStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/**
 * AbsoluteUI Scroll Area: `<div auiScrollArea label="Release notes" maxBlockSize="20rem">...</div>`.
 * Enhances the element in place (native scrolling, edge fades, a focusable region while it
 * overflows); the projected content stays Angular-managed.
 */
@Directive({ selector: '[auiScrollArea]', exportAs: 'auiScrollArea' })
export class AuiScrollArea extends ComponentBridge<ScrollArea, ScrollAreaOptions> {
  readonly label: InputSignal<ScrollAreaOptions['label']> = input.required<ScrollAreaOptions['label']>();
  readonly orientation: InputSignal<ScrollAreaOptions['orientation'] | undefined> = input<ScrollAreaOptions['orientation']>();
  readonly maxBlockSize: InputSignal<ScrollAreaOptions['maxBlockSize'] | undefined> = input<ScrollAreaOptions['maxBlockSize']>();
  readonly shadows: InputSignal<ScrollAreaOptions['shadows'] | undefined> = input<ScrollAreaOptions['shadows']>();

  constructor() {
    super();
    loadStyles(ScrollAreaStyles);
    this.init({
      create: (host, options) => ScrollArea.enhance(host, options),
      configKey: 'scrollArea',
      options: () =>
        defined<ScrollAreaOptions>({
          label: this.label(),
          orientation: this.orientation(),
          maxBlockSize: this.maxBlockSize(),
          shadows: this.shadows(),
        }),
    });
  }
}
