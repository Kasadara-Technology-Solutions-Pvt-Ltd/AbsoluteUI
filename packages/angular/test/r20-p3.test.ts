import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { EmptyStateActionDetail } from '@absoluteui/components/empty-state';
import type { SplitterPane } from '@absoluteui/components/splitter';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiEmptyState } from '../src/empty-state/index.js';
import { AuiSplitter } from '../src/splitter/index.js';
import { AuiVirtualList } from '../src/virtual-list/index.js';

// docs/PLAN-R20.md P3: generated Virtual List, Splitter, and Empty State components.
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

const names = Array.from({ length: 5000 }, (_, i) => `Person ${String(i + 1)}`);

@Component({
  imports: [AuiVirtualList],
  template: `<aui-virtual-list label="People" selection="single" height="200px" [items]="items" [itemKey]="key" [renderItem]="render" [(value)]="value"></aui-virtual-list>`,
})
class VirtualListHost {
  readonly items = names;
  readonly key = (_name: string, i: number): string => `k${String(i)}`;
  readonly render = (name: string): Node => document.createTextNode(name);
  readonly value = signal<readonly string[] | undefined>(['k2']);
}

function pane(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
}

@Component({
  imports: [AuiSplitter],
  template: `<aui-splitter [panes]="panes" [(sizes)]="sizes"></aui-splitter>`,
})
class SplitterHost {
  readonly panes: SplitterPane[] = [{ content: pane('List'), label: 'List', size: '30%', collapsible: true }, { content: pane('Detail'), label: 'Detail' }];
  readonly sizes = signal<readonly number[] | null | undefined>([40, 60]);
}

@Component({
  imports: [AuiEmptyState],
  template: `<aui-empty-state title="No results" description="Try another search." icon="search" [headingLevel]="2" [primaryAction]="{ label: 'Clear search' }" (action)="last.set($event)"></aui-empty-state>`,
})
class EmptyStateHost {
  readonly last = signal<EmptyStateActionDetail | null>(null);
}

describe('R20 P3 Angular components', () => {
  it('<aui-virtual-list> renders a window of a listbox and syncs [(value)]', async () => {
    const f = await render(VirtualListHost);
    const root = f.nativeElement as HTMLElement;
    const options = root.querySelectorAll('[role="option"]');
    expect(root.querySelector('[role="listbox"]')?.getAttribute('aria-label')).toBe('People');
    expect(options.length).toBeLessThan(30);
    expect(root.querySelector('[aria-posinset="3"]')?.getAttribute('aria-selected')).toBe('true');
    root.querySelector<HTMLElement>('[aria-posinset="5"]')?.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toEqual(['k4']);
  });

  it('<aui-splitter> applies restored sizes and exposes APG separators', async () => {
    const f = await render(SplitterHost);
    const sep = (f.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="separator"]');
    expect(sep?.getAttribute('aria-label')).toBe('List');
    expect(sep?.getAttribute('aria-valuenow')).toBe('40');
  });

  it('<aui-empty-state> renders the heading and emits (action)', async () => {
    const f = await render(EmptyStateHost);
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector('h2')?.textContent).toBe('No results');
    root.querySelector<HTMLButtonElement>('.aui-empty-state__primary')?.click();
    await f.whenStable();
    expect(f.componentInstance.last()).toEqual({ action: 'primary' });
  });
});
