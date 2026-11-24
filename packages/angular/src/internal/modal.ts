/**
 * Shared glue for modal overlays (Dialog, Drawer, Bottom Sheet, Session Warning Dialog):
 * `<aui-dialog title="..." [(open)]="confirming">...projected body...</aui-dialog>`.
 * The component is created after the first render (browser only); the projected content
 * is rendered as an embedded view and becomes the body; the `open` model drives
 * open()/close() and follows user dismissals.
 */
import { afterNextRender, computed, DestroyRef, effect, inject, untracked, ViewContainerRef, type ModelSignal, type Signal, type TemplateRef } from '@angular/core';
import { AuiConfig } from '../config.js';
import { detailOf } from './bridge.js';
import { renderTemplate, type RenderedTemplate } from './overlay.js';

export interface ModalController<O> {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(returnValue?: string): void;
  update(options: Partial<O>): void;
  destroy(): void;
}

export interface ModalConfig<C extends ModalController<O>, O> {
  create: (options: O & { content: Node }, doc: Document) => C;
  options: () => O;
  configKey: string;
  body: Signal<TemplateRef<unknown>>;
  open: ModelSignal<boolean>;
  events: Readonly<Record<string, (detail: unknown) => void>>;
}

export function bindModal<C extends ModalController<O>, O>(config: ModalConfig<C, O>): { readonly controller: () => C | null } {
  const vcr = inject(ViewContainerRef);
  const scope = inject(AuiConfig);
  const effective = computed(() => ({ ...scope.optionsFor(config.configKey), ...(config.options() as Record<string, unknown>) }) as O);
  let controller: C | null = null;
  let rendered: RenderedTemplate | null = null;
  let destroyed = false;

  effect(() => {
    const options = effective();
    const open = config.open();
    untracked(() => {
      if (!controller) return;
      controller.update(options);
      if (open && !controller.isOpen) controller.open();
      else if (!open && controller.isOpen) controller.close();
    });
  });
  afterNextRender(() => {
    const host: unknown = vcr.element.nativeElement;
    const doc = host instanceof Node && host.ownerDocument ? host.ownerDocument : document;
    rendered = renderTemplate(vcr, config.body(), doc);
    const c = config.create({ ...untracked(effective), content: rendered.fragment }, doc);
    controller = c;
    const handlers: Record<string, (detail: unknown) => void> = {
      ...config.events,
      // The model follows the component: user dismissals close it first, Session Warning may open itself.
      'aui-open': (detail) => {
        config.open.set(true);
        config.events['aui-open']?.(detail);
      },
      'aui-close': (detail) => {
        config.open.set(false);
        config.events['aui-close']?.(detail);
      },
    };
    for (const [type, handler] of Object.entries(handlers)) {
      c.element.addEventListener(type, (event) => {
        // Close events fired during teardown never reach destroyed outputs (NG0953).
        if (event.target === c.element && !destroyed) handler(detailOf(event));
      });
    }
    if (untracked(config.open)) c.open();
  });
  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    controller?.destroy();
    controller = null;
    rendered?.view.destroy();
  });
  return { controller: () => controller };
}
