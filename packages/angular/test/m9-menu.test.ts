import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { MenuItem, MenuSelectableItem } from '@absoluteui/components/menu';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiMenu } from '../src/menu/index.js';
import { AuiItem } from '../src/templates/index.js';
import { AuiMenuHarness } from '../src/testing/index.js';

// docs/PLAN-R9-ANGULAR.md M9 (D32): menu item templates.
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
  imports: [AuiMenu, AuiItem],
  template: `
    @if (show()) {
      <button type="button" [auiMenu]="items">
        Actions
        <ng-template auiItem [auiItemOf]="typed" let-item><span class="badge">{{ prefix() }} {{ item.label }}</span></ng-template>
      </button>
    }
  `,
})
class Host {
  readonly show = signal(true);
  readonly prefix = signal('>');
  /** Types the template context only (menu items are a union that includes separators). */
  readonly typed: readonly MenuSelectableItem[] = [];
  readonly items: readonly MenuItem[] = [
    { id: 'copy', label: 'Copy' },
    { id: 'more', label: 'More', items: [{ id: 'archive', label: 'Archive' }] },
  ];
}

describe('menu item templates (M9)', () => {
  it('renders live templates per item; the label stays the accessible name; views are destroyed with the menu', async () => {
    const f = await render(Host);
    const menu = await TestbedHarnessEnvironment.loader(f).getHarness(AuiMenuHarness.with({ triggerText: /Actions/ }));
    // The harness reads the accessible labels, not the decorative content.
    expect((await menu.getItems()).map((i) => i.label)).toEqual(['Copy', 'More']);
    const badges = (): string[] => Array.from(document.querySelectorAll('.aui-menu .badge'), (b) => b.textContent.trim());
    expect(badges()).toEqual(['> Copy', '> More', '> Archive']);
    f.componentInstance.prefix.set('*');
    await f.whenStable();
    expect(badges()).toEqual(['* Copy', '* More', '* Archive']);
    f.componentInstance.show.set(false);
    await f.whenStable();
    expect(document.querySelectorAll('.badge')).toHaveLength(0);
  });
});
