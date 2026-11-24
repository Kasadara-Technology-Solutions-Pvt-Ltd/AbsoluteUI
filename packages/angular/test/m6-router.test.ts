import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
// First: core/testing loads the JIT compiler that partially compiled common/router declarations need.
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, Router, RouterLink, RouterLinkActive, type Routes } from '@angular/router';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { BreadcrumbItem } from '@absoluteui/components/breadcrumb';
import type { MenuItem } from '@absoluteui/components/menu';
import type { SidebarItem } from '@absoluteui/components/sidebar';
import type { StepperStep } from '@absoluteui/components/stepper';
import type { TabItem } from '@absoluteui/components/tabs';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiLinkButton } from '../src/button/index.js';
import { AuiBreadcrumb } from '../src/breadcrumb/index.js';
import { AuiMenu } from '../src/menu/index.js';
import { AuiSidebar } from '../src/sidebar/index.js';
import { AuiStepper } from '../src/stepper/index.js';
import { AuiTabs } from '../src/tabs/index.js';
import { AuiRouterNav, type AuiRouterItem } from '../src/router/index.js';

// docs/PLAN-R9-ANGULAR.md M6: router integration.
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

@Component({ template: '' })
class Blank {
  readonly page = true;
}

let allowSecret = true;

const routes: Routes = [
  { path: 'people', component: Blank },
  { path: 'reports', component: Blank },
  { path: 'reports/annual', component: Blank },
  { path: 'secret', component: Blank, canActivate: [() => allowSecret] },
  { path: 'checkout/:step', component: Blank },
  { path: '**', component: Blank },
];

async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' }), provideRouter(routes), provideLocationMocks()],
  });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

async function settle(f: ComponentFixture<unknown>): Promise<void> {
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await f.whenStable();
}

/** Modified clicks must stay native; keep the test page where it is. */
function swallowDefault(): () => boolean {
  let prevented: boolean | null = null;
  const listener = (event: Event): void => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener('click', listener);
  return () => {
    document.removeEventListener('click', listener);
    return prevented === true;
  };
}

@Component({
  imports: [AuiLinkButton, RouterLink, RouterLinkActive],
  template: `
    <a auiButton variant="primary" routerLink="/reports" [queryParams]="{ year: 2026 }" fragment="top" routerLinkActive="is-active" [disabled]="off()">Reports</a>
    <a auiButton href="https://example.com/help" target="_blank" rel="noopener">Help</a>
  `,
})
class LinkHost {
  readonly off = signal(true);
}

describe('a[auiButton] with RouterLink (M6)', () => {
  it('renders a styled link with the router href; disabled blocks RouterLink navigation; enabled navigates', async () => {
    const f = await render(LinkHost);
    const router = TestBed.inject(Router);
    const [link, external] = Array.from((f.nativeElement as HTMLElement).querySelectorAll('a'));
    expect(link!.classList.contains('aui-button--primary')).toBe(true);
    expect(link!.getAttribute('href')).toBe('/reports?year=2026#top');
    expect(link!.getAttribute('aria-disabled')).toBe('true');
    expect(link!.getAttribute('tabindex')).toBe('-1');
    link!.click();
    await settle(f);
    expect(router.url).toBe('/');

    f.componentInstance.off.set(false);
    await settle(f);
    expect(link!.hasAttribute('aria-disabled')).toBe(false);
    expect(link!.hasAttribute('tabindex')).toBe(false);
    await userEvent.click(link!);
    await settle(f);
    expect(router.url).toBe('/reports?year=2026#top');
    expect(link!.classList.contains('is-active')).toBe(true);

    expect(external!.classList.contains('aui-button')).toBe(true);
    expect(external!.getAttribute('href')).toBe('https://example.com/help');
    expect(external!.getAttribute('target')).toBe('_blank');
  });
});

const sidebarItems: readonly AuiRouterItem<SidebarItem>[] = [
  { id: 'people', label: 'People', routerLink: '/people' },
  { type: 'group', id: 'more', label: 'More', items: [
    { id: 'reports', label: 'Reports', routerLink: ['/reports'] },
    { id: 'annual', label: 'Annual', routerLink: '/reports/annual', queryParams: { view: 'table' } },
  ] },
  { id: 'secret', label: 'Secret', routerLink: '/secret' },
  { id: 'site', label: 'Website', href: 'https://example.com/' },
];

@Component({
  imports: [AuiSidebar, AuiRouterNav],
  template: `<aui-sidebar auiRouterNav label="Main" [items]="items" [collapsible]="false" [breakpoint]="0" />`,
})
class SidebarHost {
  readonly items = sidebarItems;
}

const sidebarLink = (el: HTMLElement, id: string): HTMLAnchorElement => el.querySelector<HTMLAnchorElement>(`a.aui-sidebar__item[data-id="${id}"]`)!;
const currentId = (el: HTMLElement): string | undefined => el.querySelector<HTMLElement>('.aui-sidebar__item[aria-current="page"]')?.dataset.id;

describe('auiRouterNav (M6)', () => {
  it('Sidebar: router hrefs, Router navigation on click, selection follows the URL (most specific match)', async () => {
    const f = await render(SidebarHost);
    const el = f.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    expect(sidebarLink(el, 'people').getAttribute('href')).toBe('/people');
    expect(sidebarLink(el, 'annual').getAttribute('href')).toBe('/reports/annual?view=table');
    expect(sidebarLink(el, 'site').getAttribute('href')).toBe('https://example.com/');

    await userEvent.click(sidebarLink(el, 'people'));
    await settle(f);
    expect(router.url).toBe('/people');
    expect(currentId(el)).toBe('people');

    await router.navigateByUrl('/reports/annual');
    await settle(f);
    // /reports and /reports/annual both match; the longer path wins.
    expect(currentId(el)).toBe('annual');

    await router.navigateByUrl('/reports');
    await settle(f);
    expect(currentId(el)).toBe('reports');
  });

  it('Sidebar: a guard that rejects the navigation leaves the current route item selected', async () => {
    allowSecret = false;
    try {
      const f = await render(SidebarHost);
      const el = f.nativeElement as HTMLElement;
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/people');
      await settle(f);
      await userEvent.click(sidebarLink(el, 'secret'));
      await settle(f);
      expect(router.url).toBe('/people');
      expect(currentId(el)).toBe('people');
    } finally {
      allowSecret = true;
    }
  });

  it('Sidebar: modified clicks and external links stay native', async () => {
    const f = await render(SidebarHost);
    const el = f.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const done = swallowDefault();
    sidebarLink(el, 'people').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(done()).toBe(false);
    await settle(f);
    expect(router.url).toBe('/');

    const external = swallowDefault();
    sidebarLink(el, 'site').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(external()).toBe(false);
  });

  it('Breadcrumb, Stepper, Tabs, and Menu navigate with the Router', async () => {
    @Component({
      imports: [AuiBreadcrumb, AuiStepper, AuiTabs, AuiMenu, AuiRouterNav],
      template: `
        <aui-breadcrumb auiRouterNav [items]="trail" />
        <aui-stepper auiRouterNav label="Checkout" [steps]="steps" [linear]="false" />
        <aui-tabs auiRouterNav label="Views" [tabs]="tabs" />
        <button type="button" class="menu" [auiMenu]="menu" auiRouterNav>Go</button>
      `,
    })
    class Host {
      readonly trail: readonly AuiRouterItem<BreadcrumbItem>[] = [{ label: 'Home', routerLink: '/' }, { label: 'People', routerLink: '/people' }, { label: 'Ada' }];
      readonly steps: readonly AuiRouterItem<StepperStep>[] = [
        { id: 'cart', label: 'Cart', routerLink: ['/checkout', 'cart'] },
        { id: 'pay', label: 'Pay', routerLink: ['/checkout', 'pay'] },
      ];
      readonly tabs: readonly AuiRouterItem<TabItem>[] = [
        { id: 'people', label: 'People', routerLink: '/people' },
        { id: 'reports', label: 'Reports', routerLink: '/reports' },
      ];
      readonly menu: readonly AuiRouterItem<MenuItem>[] = [{ id: 'annual', label: 'Annual report', routerLink: '/reports/annual' }];
    }
    const f = await render(Host);
    const el = f.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);

    await userEvent.click(el.querySelector<HTMLAnchorElement>('a.aui-breadcrumb__link[data-index="1"]')!);
    await settle(f);
    expect(router.url).toBe('/people');
    // Tabs follow the URL.
    expect(el.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain('People');

    const pay = el.querySelector<HTMLAnchorElement>('a.aui-stepper__control[data-index="1"]')!;
    expect(pay.getAttribute('href')).toBe('/checkout/pay');
    await userEvent.click(pay);
    await settle(f);
    expect(router.url).toBe('/checkout/pay');
    expect(el.querySelector('.aui-stepper__control[aria-current="step"]')!.textContent).toContain('Pay');

    const reportsTab = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]')).find((t) => t.textContent.includes('Reports'))!;
    await userEvent.click(reportsTab);
    await settle(f);
    expect(router.url).toBe('/reports');

    await userEvent.click(el.querySelector<HTMLButtonElement>('button.menu')!);
    await userEvent.click(document.querySelector<HTMLElement>('[role="menuitem"]')!);
    await settle(f);
    expect(router.url).toBe('/reports/annual');
  });
});
