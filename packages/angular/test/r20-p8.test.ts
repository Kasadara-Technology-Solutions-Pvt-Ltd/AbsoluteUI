import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { DiagramChangeDetail, DiagramModel, DiagramNodeActivateDetail } from '@absoluteui/components/diagram';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiDiagram } from '../src/diagram/index.js';

// docs/PLAN-R20.md P8: the generated Diagram component.
beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {
    // Already initialized by another test file in the same run.
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

@Component({
  imports: [AuiDiagram],
  template: `<aui-diagram label="Approval" [editable]="editable()" [(model)]="model" (changed)="last.set($event)" (nodeActivated)="activated.set($event)"></aui-diagram>`,
})
class DiagramHost {
  readonly editable = signal(false);
  readonly model = signal<DiagramModel>({
    nodes: [
      { id: 'a', label: 'Request', x: 0, y: 0 },
      { id: 'b', label: 'Manager approval', shape: 'diamond', x: 240, y: 0 },
    ],
    edges: [{ id: 'ab', from: 'a', to: 'b' }],
  });
  readonly last = signal<DiagramChangeDetail | null>(null);
  readonly activated = signal<DiagramNodeActivateDetail | null>(null);
}

describe('AuiDiagram (R20 P8)', () => {
  it('renders nodes as listbox options and activates with Enter', async () => {
    const fixture = await render(DiagramHost);
    const el = fixture.nativeElement as HTMLElement;
    const options = el.querySelectorAll('.aui-diagram__node[role="option"]');
    expect(options).toHaveLength(2);
    const first = options[0] as SVGGElement;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.componentInstance.activated()?.id).toBe('a');
  });

  it('updates the two-way model after an edit', async () => {
    const fixture = await render(DiagramHost);
    fixture.componentInstance.editable.set(true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const node = el.querySelector<SVGGElement>('[data-aui-node="b"]');
    node?.focus();
    node?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.last()?.reason).toBe('delete');
    expect(fixture.componentInstance.model().nodes.map((n) => n.id)).toEqual(['a']);
    expect(fixture.componentInstance.model().edges).toHaveLength(0);
  });
});
