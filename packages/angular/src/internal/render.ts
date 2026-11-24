/**
 * Templates as render-slot nodes (docs/PLAN-R9-ANGULAR.md D8). A template is rendered
 * as an embedded view in the owning component's view container (so it lives in the
 * consumer's DI and change detection), its root nodes are wrapped in one element the
 * component can hold, and the view is destroyed when the component releases the node.
 * On the server (D3) the view is attached to the application instead: its nodes end up
 * inside a host that skips hydration, so it must not be serialized as a view of the
 * container (the browser would look for its nodes next to the host).
 */
import { ChangeDetectionStrategy, Component, ViewEncapsulation, type ApplicationRef, type EmbeddedViewRef, type TemplateRef, type ViewContainerRef } from '@angular/core';
import { onNodeRelease } from '@absoluteui/core';

/** The wrapper does not take part in layout. */
@Component({
  selector: 'aui-styles-template',
  template: '',
  styles: ['@layer aui.base{.aui-template{display:contents}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateStyles {}

/** An embedded view in `vcr` in the browser; on the server (`app` given), attached to the application. */
export function createTemplateView<C>(vcr: ViewContainerRef, template: TemplateRef<C>, context: C, app: ApplicationRef | null): EmbeddedViewRef<C> {
  if (!app) return vcr.createEmbeddedView(template, context);
  const view = template.createEmbeddedView(context);
  app.attachView(view);
  return view;
}

export function renderTemplateNode<C>(vcr: ViewContainerRef, template: TemplateRef<C>, context: C, doc: Document, app: ApplicationRef | null = null): HTMLElement {
  const view: EmbeddedViewRef<C> = createTemplateView(vcr, template, context, app);
  view.detectChanges();
  const wrapper = doc.createElement('span');
  wrapper.className = 'aui-template';
  for (const node of view.rootNodes as Node[]) wrapper.append(node);
  return onNodeRelease(wrapper, () => {
    if (!view.destroyed) view.destroy();
  });
}
