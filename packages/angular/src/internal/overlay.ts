/**
 * Template content for AbsoluteUI overlays. The template is rendered as an
 * Angular embedded view (bindings and change detection keep working) and its
 * root nodes are handed to the component as a DocumentFragment, the same
 * technique the Angular CDK uses for portals.
 */
import type { EmbeddedViewRef, TemplateRef, ViewContainerRef } from '@angular/core';

export interface RenderedTemplate {
  readonly fragment: DocumentFragment;
  readonly view: EmbeddedViewRef<unknown>;
}

export function renderTemplate(vcr: ViewContainerRef, template: TemplateRef<unknown>, doc: Document): RenderedTemplate {
  const view = vcr.createEmbeddedView(template);
  view.detectChanges();
  const fragment = doc.createDocumentFragment();
  for (const node of view.rootNodes as Node[]) fragment.append(node);
  return { fragment, view };
}
