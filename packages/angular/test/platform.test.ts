import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { getCommonConfig, resetAbsoluteUIConfig } from '@absoluteui/core';
import { AuiConfig, AuiLocale, provideAbsoluteUI, provideAbsoluteUIConfig, type AbsoluteUIOptions } from '../src/index.js';
import { AuiFocusTrap, AuiHotkey, AuiLiveAnnouncer, AuiRovingTabindex } from '../src/a11y/index.js';
import { AuiBarChart } from '../src/bar-chart/index.js';
import { AuiButton } from '../src/button/index.js';
import { chartToSvg } from '../src/chart-export/index.js';
import { AuiIcon } from '../src/icon/index.js';
import { AuiTabs } from '../src/tabs/index.js';
import { AuiTextInput } from '../src/text-input/index.js';

// docs/PLAN-R9-ANGULAR.md M1: configuration scopes, models, typed methods, bundled styles,
// icon outlet, and the accessibility layer.
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

async function render<T>(type: new () => T, options: AbsoluteUIOptions = {}): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, ...options })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

const TABS = [
  { id: 'a', label: 'A', content: 'Alpha' },
  { id: 'b', label: 'B', content: 'Beta' },
];

@Component({
  selector: 'test-scoped-tabs',
  imports: [AuiTabs],
  providers: [provideAbsoluteUIConfig({ components: { tabs: { orientation: 'horizontal' } }, locale: 'de-DE' })],
  template: `<aui-tabs class="scoped" label="Scoped" [tabs]="tabs"></aui-tabs>`,
})
class ScopedTabs {
  readonly tabs = TABS;
  readonly locale = inject(AuiLocale);
}

@Component({
  imports: [AuiTabs, ScopedTabs],
  template: `
    <aui-tabs class="app" label="App" [tabs]="tabs"></aui-tabs>
    <aui-tabs class="local" label="Local" [tabs]="tabs" orientation="horizontal"></aui-tabs>
    <test-scoped-tabs />
  `,
})
class ConfigHost {
  readonly tabs = TABS;
}

describe('configuration scopes (D7)', () => {
  it('applies app, nested, and local settings with the documented precedence', async () => {
    const f = await render(ConfigHost, { components: { tabs: { orientation: 'vertical' } } });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('aui-tabs.app')!.classList).toContain('aui-tabs--vertical');
    expect(el.querySelector('aui-tabs.local')!.classList).toContain('aui-tabs--horizontal');
    expect(el.querySelector('aui-tabs.scoped')!.classList).toContain('aui-tabs--horizontal');
    expect((f.debugElement.query(By.directive(ScopedTabs)).componentInstance as ScopedTabs).locale.locale()).toBe('de-DE');
    expect(TestBed.inject(AuiLocale).locale()).toBe('en-US');
    // Nested scopes never write the page-global layer.
    expect(getCommonConfig().locale).toBe('en-US');
  });

  it('runtime changes reach existing components', async () => {
    const f = await render(ConfigHost);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('aui-tabs.app')!.classList).toContain('aui-tabs--horizontal');
    TestBed.inject(AuiConfig).patch({ components: { tabs: { orientation: 'vertical' } } });
    await f.whenStable();
    expect(el.querySelector('aui-tabs.app')!.classList).toContain('aui-tabs--vertical');
    // The application scope is also the global layer in the browser.
    TestBed.inject(AuiConfig).patch({ timezone: 'Asia/Kolkata' });
    await f.whenStable();
    expect(getCommonConfig().timezone).toBe('Asia/Kolkata');
  });

  it('rejects invalid configuration at the provider', () => {
    expect(() => provideAbsoluteUIConfig({ timezone: 'Not/AZone' })).toThrow();
  });
});

@Component({
  imports: [AuiTabs, AuiTextInput, AuiButton],
  template: `
    <aui-tabs #tabsRef="auiTabs" label="Sections" [tabs]="tabs" [(value)]="tab"></aui-tabs>
    <aui-text-input #nameRef="auiTextInput" label="Name" [(value)]="name"></aui-text-input>
    <button auiButton variant="primary">Save</button>
  `,
})
class ModelHost {
  readonly tabs = TABS;
  readonly tab = signal('a');
  readonly name = signal('Ada');
}

describe('models, typed methods, bundled styles (D5, D6, D10)', () => {
  it('[(value)] follows the user and the parent', async () => {
    const f = await render(ModelHost);
    const el = f.nativeElement as HTMLElement;
    const tabs = el.querySelectorAll<HTMLElement>('[role="tab"]');
    await userEvent.click(tabs[1]!);
    expect(f.componentInstance.tab()).toBe('b');
    f.componentInstance.tab.set('a');
    await f.whenStable();
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');

    const input = el.querySelector<HTMLInputElement>('.aui-text-input__input')!;
    expect(input.value).toBe('Ada');
    await userEvent.click(input);
    await userEvent.keyboard('{End} Lovelace');
    expect(f.componentInstance.name()).toBe('Ada Lovelace');
    f.componentInstance.name.set('Grace');
    await f.whenStable();
    expect(input.value).toBe('Grace');
  });

  it('exposes typed component methods', async () => {
    const f = await render(ModelHost);
    const el = f.nativeElement as HTMLElement;
    const text = f.debugElement.query(By.directive(AuiTextInput)).componentInstance as AuiTextInput;
    text.focus();
    expect(document.activeElement).toBe(el.querySelector('.aui-text-input__input'));
  });

  it('bundles component CSS: hosts are not inline, the button is styled', async () => {
    const f = await render(ModelHost);
    const el = f.nativeElement as HTMLElement;
    // Custom elements default to inline; the base layer makes hosts blocks and component CSS (layered later) still wins.
    expect(getComputedStyle(el.querySelector('aui-text-input')!).display).not.toBe('inline');
    expect(getComputedStyle(el.querySelector('aui-tabs')!).display).toBe('flex');
    const button = el.querySelector('button[auibutton]')!;
    expect(button.classList).toContain('aui-button');
    expect(getComputedStyle(button).cursor).toBe('pointer');
  });
});

@Component({
  imports: [AuiIcon, AuiFocusTrap, AuiHotkey, AuiRovingTabindex],
  template: `
    <aui-icon class="deco" name="calendar" size="sm" />
    <aui-icon class="named" name="info" label="Information" />
    <button class="outside">Outside</button>
    <div class="trap" [auiFocusTrap]="trapping()">
      <button class="first">First</button>
      <button class="last">Last</button>
    </div>
    <div class="keys" tabindex="0" auiHotkey="Mod+K" (hotkey)="hits.set(hits() + 1)"></div>
    <div class="toolbar" role="toolbar" auiRovingTabindex orientation="horizontal">
      <button>One</button><button>Two</button><button>Three</button>
    </div>
  `,
})
class A11yHost {
  readonly trapping = signal(false);
  readonly hits = signal(0);
}

describe('icon outlet and accessibility layer', () => {
  it('renders registered icons, decorative unless labelled', async () => {
    const f = await render(A11yHost);
    const el = f.nativeElement as HTMLElement;
    const deco = el.querySelector('aui-icon.deco svg')!;
    expect(deco.getAttribute('aria-hidden')).toBe('true');
    const named = el.querySelector('aui-icon.named > *')!;
    expect(named.getAttribute('aria-label')).toBe('Information');
  });

  it('focus trap keeps Tab inside and restores focus when released', async () => {
    const f = await render(A11yHost);
    const el = f.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.outside')!.focus();
    f.componentInstance.trapping.set(true);
    await f.whenStable();
    expect(document.activeElement).toBe(el.querySelector('.first'));
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(el.querySelector('.first'));
    f.componentInstance.trapping.set(false);
    await f.whenStable();
    expect(document.activeElement).toBe(el.querySelector('.outside'));
  });

  it('hotkeys, roving tabindex, and live announcements', async () => {
    const f = await render(A11yHost);
    const el = f.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('.keys')!.focus();
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control';
    await userEvent.keyboard(`{${mod}>}k{/${mod}}`);
    expect(f.componentInstance.hits()).toBe(1);

    const items = el.querySelectorAll<HTMLButtonElement>('.toolbar button');
    expect([...items].map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    items[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(items[1]);

    TestBed.inject(AuiLiveAnnouncer).announce('Saved');
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.querySelector('[data-aui-live-region="polite"]')!.textContent).toBe('Saved');
  });
});

@Component({
  imports: [AuiBarChart],
  template: `<aui-bar-chart #chart="auiBarChart" label="Tickets" [categories]="['North', 'South']" [series]="series"></aui-bar-chart>`,
})
class ChartHost {
  readonly series = [{ id: 'open', label: 'Open', values: [3, 5] }];
}

describe('chart export', () => {
  it('exports a rendered Angular chart without exposing its controller', async () => {
    const f = await render(ChartHost);
    const chart = f.debugElement.query(By.directive(AuiBarChart)).componentInstance as AuiBarChart;
    expect(chartToSvg(chart)).toMatch(/^<svg[\s\S]*<\/svg>$/);
  });
});
