import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { WidgetRegistry, type DashboardChangeDetail, type DashboardMode } from '@absoluteui/components/dashboard';
import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiDashboard } from '../src/dashboard/index.js';

// docs/PLAN-R18-DASHBOARD.md: hand-written Angular binding of the JSON dashboard.
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

const registry = new WidgetRegistry();
registerBuiltInWidgets(registry);

const text = (id: string, x: number): Record<string, unknown> => ({ id, type: 'text', title: `Widget ${id}`, options: { text: id }, layout: { x, y: 0, w: 3, h: 2 } });
const board = (...ids: string[]): Record<string, unknown> => ({ schemaVersion: 1, id: 'ops', title: 'Ops', widgets: ids.map((id, i) => text(id, i * 3)) });

@Component({
  imports: [AuiDashboard],
  template: `
    <aui-dashboard
      #dash="auiDashboard"
      [(definition)]="definition"
      [(mode)]="mode"
      [registry]="registry"
      [lazy]="false"
      [editable]="true"
      [label]="label()"
      (dashboardChange)="changes.push($event)"
    ></aui-dashboard>
  `,
})
class Host {
  readonly registry = registry;
  readonly definition = signal<unknown>(board('a', 'b'));
  readonly mode = signal<DashboardMode | undefined>('view');
  readonly label = signal('Ops widgets');
  readonly changes: DashboardChangeDetail[] = [];
  readonly dash = viewChild.required<AuiDashboard>('dash');
}

async function render(): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' })] });
  const fixture = TestBed.createComponent(Host);
  (fixture.nativeElement as HTMLElement).style.inlineSize = '1200px';
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

const element = (f: ComponentFixture<Host>): HTMLElement => (f.nativeElement as HTMLElement).querySelector('aui-dashboard')!;
const items = (f: ComponentFixture<Host>): string[] => [...element(f).querySelectorAll('[data-aui-item]')].map((e) => e.getAttribute('data-aui-item') ?? '');

describe('R18 Angular dashboard', () => {
  it('renders the definition with toolbar and widgets', async () => {
    const f = await render();
    const host = element(f);
    expect(host.classList).toContain('aui-dashboard-root');
    expect(host.querySelector('.aui-dashboard-toolbar')).not.toBeNull();
    expect(items(f)).toEqual(['a', 'b']);
  });

  it('[(definition)]: a programmatic change renders; a component change updates the model and emits dashboardChange', async () => {
    const f = await render();
    f.componentInstance.definition.set(board('a', 'b', 'c'));
    await f.whenStable();
    expect(items(f)).toEqual(['a', 'b', 'c']);
    expect(f.componentInstance.changes.at(-1)?.reason).toBe('definition');

    expect(f.componentInstance.dash().removeWidget('a')).toBe(true);
    await f.whenStable();
    expect(items(f)).toEqual(['b', 'c']);
    const last = f.componentInstance.changes.at(-1);
    expect(last?.reason).toBe('remove');
    expect(f.componentInstance.definition()).toBe(last?.definition);

    // An equal (JSON) value is not re-applied: no extra change event.
    const count = f.componentInstance.changes.length;
    f.componentInstance.definition.set(JSON.parse(JSON.stringify(f.componentInstance.definition())) as unknown);
    await f.whenStable();
    expect(f.componentInstance.changes.length).toBe(count);
  });

  it('[(mode)]: the toolbar switch updates the model; the model switches the dashboard', async () => {
    const f = await render();
    const host = element(f);
    host.querySelector<HTMLInputElement>('.aui-dashboard-toolbar__edit input')!.click();
    await f.whenStable();
    expect(f.componentInstance.mode()).toBe('edit');
    expect(host.classList).toContain('aui-dashboard-root--editing');

    f.componentInstance.mode.set('view');
    await f.whenStable();
    expect(host.classList).not.toContain('aui-dashboard-root--editing');
  });

  it('another input change re-creates the dashboard and keeps the current definition', async () => {
    const f = await render();
    f.componentInstance.dash().removeWidget('b');
    await f.whenStable();
    f.componentInstance.label.set('Operations');
    await f.whenStable();
    expect(items(f)).toEqual(['a']);
    expect(element(f).querySelectorAll('.aui-dashboard-toolbar').length).toBe(1);
    expect(f.componentInstance.dash().undo()).toBe(false);
  });
});
