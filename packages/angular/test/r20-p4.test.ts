import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { Command } from '@absoluteui/components/command-palette';
import type { TreeNode } from '@absoluteui/components/tree-view';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiCommandPalette } from '../src/command-palette/index.js';
import { AuiTreeSelect } from '../src/tree-select/index.js';
import { AuiTreeView } from '../src/tree-view/index.js';

// docs/PLAN-R20.md P4: generated Tree View, Tree Select, and Command Palette components.
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

const nodes: TreeNode[] = [
  { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web' }, { id: 'platform', label: 'Platform' }] },
  { id: 'ops', label: 'Operations' },
];

@Component({
  imports: [AuiTreeView],
  template: `<aui-tree-view label="Departments" selection="single" height="200px" [nodes]="nodes" [(selected)]="selected" [(expanded)]="expanded"></aui-tree-view>`,
})
class TreeViewHost {
  readonly nodes = nodes;
  readonly selected = signal<readonly string[] | undefined>(['web']);
  readonly expanded = signal<readonly string[] | undefined>(['eng']);
}

@Component({
  imports: [AuiTreeSelect],
  template: `<aui-tree-select label="Department" name="department" [nodes]="nodes" [(value)]="value"></aui-tree-select>`,
})
class TreeSelectHost {
  readonly nodes = nodes;
  readonly value = signal<string[] | undefined>(['platform']);
}

@Component({
  imports: [AuiCommandPalette],
  template: `<aui-command-palette [commands]="commands" (selected)="last.set($event.id)"></aui-command-palette>`,
})
class CommandPaletteHost {
  readonly commands: Command[] = [{ id: 'home', label: 'Go to dashboard', group: 'Navigation' }];
  readonly last = signal<string | null>(null);
}

describe('R20 P4 Angular components', () => {
  it('<aui-tree-view> renders treeitems and syncs [(selected)] and [(expanded)]', async () => {
    const f = await render(TreeViewHost);
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('Departments');
    expect(root.querySelector('[data-id="web"]')?.getAttribute('aria-selected')).toBe('true');
    root.querySelector<HTMLElement>('[data-id="platform"]')?.click();
    await f.whenStable();
    expect(f.componentInstance.selected()).toEqual(['platform']);
    root.querySelector<HTMLElement>('[data-id="eng"] .aui-tree-view__twisty')?.click();
    await f.whenStable();
    expect(f.componentInstance.expanded()).toEqual([]);
  });

  it('<aui-tree-select> shows the value and submits a hidden input', async () => {
    const f = await render(TreeSelectHost);
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe('Platform');
    expect(root.querySelector<HTMLInputElement>('input[type="hidden"][name="department"]')?.value).toBe('platform');
  });

  it('<aui-command-palette> renders a closed dialog', async () => {
    const f = await render(CommandPaletteHost);
    const dialog = (f.nativeElement as HTMLElement).querySelector('dialog');
    expect(dialog?.getAttribute('aria-label')).toBe('Command palette');
    expect(dialog?.open).toBe(false);
    expect(f.componentInstance.last()).toBeNull();
  });
});
