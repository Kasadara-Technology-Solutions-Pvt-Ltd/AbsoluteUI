/**
 * Programmatic overlays (docs/PLAN-R9-ANGULAR.md M3): open an Angular component or
 * template in an AbsoluteUI Dialog or Drawer.
 *
 * ```ts
 * const ref = inject(AuiDialogService).open(EditUser, { title: 'Edit user', data: user });
 * const { result } = await ref.closed;
 *
 * // In EditUser:
 * readonly data = inject<User>(AUI_DIALOG_DATA);
 * readonly ref = inject<AuiDialogRef<User>>(AuiDialogRef);
 * save(): void { this.ref.close(this.form.value); }
 * ```
 *
 * The content keeps the caller's DI (pass `injector` for a component's own providers)
 * and runs in the application's change detection. Positioning, focus trapping and
 * restoration, Escape, backdrop, and stacking come from the components. On the server
 * nothing opens and `closed` resolves with no result.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  PLATFORM_ID,
  TemplateRef,
  type ComponentRef,
  type EmbeddedViewRef,
  type Type,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Dialog, type DialogOptions } from '@absoluteui/components/dialog';
import { Drawer, type DrawerOptions } from '@absoluteui/components/drawer';
import { AuiConfig } from '../config.js';
import { DialogStyles, DrawerStyles } from '../internal/style-sheets.js';
import { AuiStyleLoader } from '../internal/styles.js';

/** Data passed with `open(..., { data })`. */
export const AUI_DIALOG_DATA = new InjectionToken<unknown>('AUI_DIALOG_DATA');

/** How an overlay opened by a service was closed. */
export interface AuiOverlayClosed<R> {
  /** Value passed to `ref.close(result)`; undefined when the user dismissed the overlay. */
  readonly result: R | undefined;
  /** The component's return value: an action value, or '' for Escape, backdrop, and the close button. */
  readonly returnValue: string;
}

/** Handle of an overlay opened by `AuiDialogService` or `AuiDrawerService`. */
export abstract class AuiDialogRef<R = unknown> {
  /** Resolves once, when the overlay has closed and its content was destroyed. */
  abstract readonly closed: Promise<AuiOverlayClosed<R>>;
  /** Close with a result. */
  abstract close(result?: R): void;
}

/** Context of a template opened by a service: `let-data` and `let-ref="ref"`. */
export interface AuiOverlayTemplateContext<D, R> {
  readonly $implicit: D;
  readonly ref: AuiDialogRef<R>;
}

interface OverlayCommon<D> {
  /** Accessible name and heading (text). */
  title: string;
  description?: string;
  data?: D;
  /** Parent injector of the content (default: the root injector of the application). */
  injector?: Injector;
}

/** Options of `AuiDialogService.open`: title, description, `data` for the content, and the Dialog options. */
export type AuiDialogConfig<D = unknown> = OverlayCommon<D> & Omit<DialogOptions, 'title' | 'description' | 'content'>;
/** Options of `AuiDrawerService.open`: title, description, `data` for the content, and the Drawer options. */
export type AuiDrawerConfig<D = unknown> = OverlayCommon<D> & Omit<DrawerOptions, 'title' | 'description' | 'content'>;

/** The component options of a config (without `data` and `injector`). */
function modalOptions<T extends OverlayCommon<unknown>>(config: T): Omit<T, 'data' | 'injector'> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) if (key !== 'data' && key !== 'injector') out[key] = value;
  // Safe: exactly the keys of T except data and injector.
  return out as Omit<T, 'data' | 'injector'>;
}

interface ModalLike {
  readonly element: HTMLElement;
  open(): void;
  close(returnValue?: string): void;
  destroy(): void;
}

class OverlayRef<R> extends AuiDialogRef<R> {
  readonly closed: Promise<AuiOverlayClosed<R>>;
  #resolve: (value: AuiOverlayClosed<R>) => void = () => undefined;
  #result: R | undefined;
  #modal: ModalLike | null = null;
  #done = false;

  constructor() {
    super();
    this.closed = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  attach(modal: ModalLike): void {
    this.#modal = modal;
  }

  close(result?: R): void {
    if (this.#done) return;
    this.#result = result;
    if (this.#modal) this.#modal.close();
    else this.finish('');
  }

  finish(returnValue: string): void {
    if (this.#done) return;
    this.#done = true;
    this.#resolve({ result: this.#result, returnValue });
  }
}

abstract class OverlayService {
  readonly #app = inject(ApplicationRef);
  readonly #environment = inject(EnvironmentInjector);
  readonly #root = inject(Injector);
  readonly #doc = inject(DOCUMENT);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #config = inject(AuiConfig);
  readonly #styles = inject(AuiStyleLoader);

  protected openModal<R, D>(
    content: Type<unknown> | TemplateRef<AuiOverlayTemplateContext<D, R>>,
    common: OverlayCommon<D>,
    configKey: string,
    create: (content: Node, scope: Record<string, unknown>, doc: Document) => ModalLike,
  ): AuiDialogRef<R> {
    const ref = new OverlayRef<R>();
    if (!this.#browser) {
      ref.finish('');
      return ref;
    }
    this.#loadStyles();
    const injector = Injector.create({
      providers: [
        { provide: AuiDialogRef, useValue: ref },
        { provide: AUI_DIALOG_DATA, useValue: common.data },
      ],
      parent: common.injector ?? this.#root,
    });
    let view: ComponentRef<unknown> | EmbeddedViewRef<AuiOverlayTemplateContext<D, R>>;
    let node: Node;
    if (content instanceof TemplateRef) {
      const embedded = content.createEmbeddedView({ $implicit: common.data as D, ref }, injector);
      this.#app.attachView(embedded);
      embedded.detectChanges();
      const wrapper = this.#doc.createElement('div');
      wrapper.append(...(embedded.rootNodes as Node[]));
      view = embedded;
      node = wrapper;
    } else {
      const component = createComponent(content, { environmentInjector: this.#environment, elementInjector: injector });
      this.#app.attachView(component.hostView);
      component.changeDetectorRef.detectChanges();
      view = component;
      node = component.location.nativeElement as Node;
    }
    const modal = create(node, this.#config.optionsFor(configKey), this.#doc);
    ref.attach(modal);
    modal.element.addEventListener('aui-close', (event) => {
      if (event.target !== modal.element) return;
      const detail = (event as CustomEvent<{ returnValue?: string }>).detail;
      // Destroy after the close event has finished dispatching.
      queueMicrotask(() => {
        modal.destroy();
        view.destroy();
        ref.finish(detail.returnValue ?? '');
      });
    });
    modal.open();
    return ref;
  }

  protected abstract loadStyles(loader: AuiStyleLoader): void;

  #loadStyles(): void {
    this.loadStyles(this.#styles);
  }
}

/** Open components or templates in a modal AbsoluteUI Dialog. */
@Injectable({ providedIn: 'root' })
export class AuiDialogService extends OverlayService {
  /** Open a component (it can inject `AUI_DIALOG_DATA` and `AuiDialogRef`) or a template in a modal dialog. */
  open<R = unknown, D = unknown>(content: Type<unknown> | TemplateRef<AuiOverlayTemplateContext<D, R>>, config: AuiDialogConfig<D>): AuiDialogRef<R> {
    const options = modalOptions(config);
    return this.openModal<R, D>(content, config, 'dialog', (node, scope, doc) => Dialog.create({ ...scope, ...options, content: node }, doc));
  }

  protected loadStyles(loader: AuiStyleLoader): void {
    loader.load(DialogStyles);
  }
}

/** Open components or templates in an AbsoluteUI Drawer. */
@Injectable({ providedIn: 'root' })
export class AuiDrawerService extends OverlayService {
  /** Open a component (it can inject `AUI_DIALOG_DATA` and `AuiDialogRef`) or a template in a drawer. */
  open<R = unknown, D = unknown>(content: Type<unknown> | TemplateRef<AuiOverlayTemplateContext<D, R>>, config: AuiDrawerConfig<D>): AuiDialogRef<R> {
    const options = modalOptions(config);
    return this.openModal<R, D>(content, config, 'drawer', (node, scope, doc) => Drawer.create({ ...scope, ...options, content: node }, doc));
  }

  protected loadStyles(loader: AuiStyleLoader): void {
    loader.load(DrawerStyles);
  }
}
