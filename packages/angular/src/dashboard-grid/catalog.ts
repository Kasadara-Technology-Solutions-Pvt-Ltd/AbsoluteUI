import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, output, untracked, ViewEncapsulation, type InputSignal, type OutputEmitterRef } from '@angular/core';
import { DashboardCatalog, type DashboardCatalogAddDetail, type DashboardCatalogOptions, type DashboardGrid } from '@absoluteui/components/dashboard-grid';
import { controllerOf } from '../internal/bridge.js';
import type { AuiDashboardGrid } from './index.js';

/**
 * AbsoluteUI Dashboard Catalog for a Dashboard Grid in the same template:
 * `<aui-dashboard-grid #board="auiDashboardGrid" ...>...</aui-dashboard-grid>
 *  <aui-dashboard-catalog label="Widgets" [templates]="templates" [grid]="board" (catalogAdded)="add($event)"></aui-dashboard-catalog>`.
 * `catalogAdded` receives the cancelable DOM event: render the widget for
 * `event.detail.item`, or call `event.preventDefault()` to veto. The catalog is created
 * when the grid exists and re-created when it changes.
 */
@Component({
  selector: 'aui-dashboard-catalog',
  exportAs: 'auiDashboardCatalog',
  template: '',
  styles: ['@layer aui.base{:where(aui-dashboard-catalog){display:block}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiDashboardCatalog {
  /** The grid that receives the widgets: a `#grid="auiDashboardGrid"` reference. */
  readonly grid: InputSignal<AuiDashboardGrid | null | undefined> = input<AuiDashboardGrid | null>();
  /** Accessible name of the catalog list. */
  readonly label: InputSignal<string> = input.required<string>();
  /** Widget templates offered by the catalog. */
  readonly templates: InputSignal<DashboardCatalogOptions['templates']> = input.required<DashboardCatalogOptions['templates']>();
  /** Render the widget element for a new item without Angular; usually leave it unset and render in `catalogAdded`. */
  readonly create: InputSignal<DashboardCatalogOptions['create'] | undefined> = input<DashboardCatalogOptions['create']>();
  /** Messages locale (defaults to the configured locale). */
  readonly locale: InputSignal<string | undefined> = input<string>();
  /** A template was chosen (cancelable DOM event): render the widget for `event.detail.item`, or call `preventDefault()` to veto. */
  readonly catalogAdded: OutputEmitterRef<CustomEvent<DashboardCatalogAddDetail>> = output<CustomEvent<DashboardCatalogAddDetail>>();
  readonly #host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #catalog: DashboardCatalog | null = null;
  #ready = false;

  constructor() {
    const onAdd = (event: Event): void => {
      if (event.target === this.#host && event instanceof CustomEvent) {
        // Safe: the catalog dispatches DashboardCatalogAddDetail (documented contract).
        this.catalogAdded.emit(event as CustomEvent<DashboardCatalogAddDetail>);
      }
    };
    const resolve = (): DashboardGrid | null => {
      const source = this.grid();
      return source ? controllerOf(source)() : null;
    };
    effect(() => {
      const grid = resolve();
      untracked(() => {
        if (this.#ready) this.#recreate(grid);
      });
    });
    effect(() => {
      const label = this.label();
      const templates = this.templates();
      untracked(() => {
        this.#catalog?.update({ label, templates });
      });
    });
    afterNextRender(() => {
      this.#ready = true;
      this.#host.addEventListener('aui-catalog-add', onAdd);
      this.#recreate(untracked(resolve));
    });
    inject(DestroyRef).onDestroy(() => {
      this.#host.removeEventListener('aui-catalog-add', onAdd);
      this.#catalog?.destroy();
      this.#catalog = null;
    });
  }

  #recreate(grid: DashboardGrid | null): void {
    this.#catalog?.destroy();
    this.#catalog = null;
    if (!grid) return;
    const create = untracked(this.create);
    const locale = untracked(this.locale);
    this.#catalog = DashboardCatalog.create(this.#host, {
      grid,
      label: untracked(this.label),
      templates: untracked(this.templates),
      ...(create === undefined ? {} : { create }),
      ...(locale === undefined ? {} : { locale }),
    });
  }
}
