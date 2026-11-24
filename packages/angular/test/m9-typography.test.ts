import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { provideAbsoluteUI, provideAbsoluteUIConfig } from '../src/index.js';
import { AUI_TYPOGRAPHY } from '../src/typography/index.js';

// docs/PLAN-R9-ANGULAR.md M9 (D30): typography directives.
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
  imports: [...AUI_TYPOGRAPHY],
  providers: [provideAbsoluteUIConfig({ locale: 'de-DE' })],
  template: `
    <h3 class="title" auiHeading [size]="size()">Team</h3>
    <p auiText tone="muted" size="sm" [strong]="strong()">Notes</p>
    <a auiLink href="https://example.com/docs" [external]="external()" muted>Docs</a>
    <p class="long" [auiLineClamp]="lines()">Long text</p>
  `,
})
class Host {
  readonly size = signal<1 | 2 | 3 | 4 | 5 | 6 | undefined>(undefined);
  readonly strong = signal(false);
  readonly external = signal(true);
  readonly lines = signal(2);
}

describe('typography directives (M9)', () => {
  it('apply and update the classes, the link hint, and the line clamp; destroy restores the elements', async () => {
    const f = await render(Host);
    const root = f.nativeElement as HTMLElement;
    const h = root.querySelector('h3')!;
    const p = root.querySelector('p[auitext]')!;
    const a = root.querySelector('a')!;
    const clamp = root.querySelector<HTMLElement>('p.long')!;
    expect(h.className).toBe('title aui-heading aui-heading--3');
    expect(p.className).toBe('aui-text aui-text--muted aui-text--sm');
    expect(a.className).toBe('aui-link aui-link--muted');
    expect(a.target).toBe('_blank');
    expect(clamp.style.getPropertyValue('--aui-lines')).toBe('2');
    f.componentInstance.size.set(1);
    f.componentInstance.strong.set(true);
    f.componentInstance.external.set(false);
    f.componentInstance.lines.set(4);
    await f.whenStable();
    expect(h.className).toBe('title aui-heading aui-heading--1');
    expect(p.classList.contains('aui-text--strong')).toBe(true);
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.textContent).toBe('Docs');
    expect(clamp.style.getPropertyValue('--aui-lines')).toBe('4');
    f.destroy();
    expect(h.className).toBe('title');
    expect(clamp.style.getPropertyValue('--aui-lines')).toBe('');
  });

  it('the new-tab hint follows the scope locale', async () => {
    const f = await render(Host);
    const a = (f.nativeElement as HTMLElement).querySelector('a')!;
    // No German catalog is registered: the English fallback is used, through the scoped locale path.
    expect(a.querySelector('.aui-link__hint')?.textContent).toBe(' (opens in a new tab)');
  });
});
