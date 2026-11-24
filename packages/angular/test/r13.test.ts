import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiFieldset } from '../src/fieldset/index.js';
import { AuiBadge } from '../src/badge/index.js';
import { AuiButton } from '../src/button/index.js';
import { AuiScrollArea } from '../src/scroll-area/index.js';

// docs/PLAN-R13-COMPONENTS.md: hand-written Fieldset directive and a generated R13 component.
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
  imports: [AuiFieldset, AuiBadge],
  template: `
    <fieldset auiFieldset legend="Delivery address" [required]="true" [error]="error()" [disabled]="locked()">
      <input name="street" aria-label="Street" />
      @if (showCity()) {
        <input name="city" aria-label="City" />
      }
    </fieldset>
    <aui-badge [label]="status()" tone="success"></aui-badge>
  `,
})
class Host {
  readonly error = signal<string | null>(null);
  readonly locked = signal(false);
  readonly showCity = signal(false);
  readonly status = signal('Active');
}

describe('R13 Angular bindings', () => {
  it('fieldset[auiFieldset] enhances in place, keeps projected controls, and binds error and native disabled', async () => {
    const f = await render(Host);
    const fieldset = (f.nativeElement as HTMLElement).querySelector('fieldset')!;
    expect(fieldset.classList).toContain('aui-fieldset');
    expect(fieldset.firstElementChild!.localName).toBe('legend');
    expect(fieldset.querySelector('legend')!.textContent).toBe('Delivery address* (required)');
    f.componentInstance.showCity.set(true);
    f.componentInstance.error.set('Enter a street and a city');
    await f.whenStable();
    expect(fieldset.querySelectorAll('input')).toHaveLength(2);
    expect(fieldset.classList).toContain('aui-fieldset--invalid');
    expect(fieldset.querySelector('.aui-field__error')!.textContent).toBe('Enter a street and a city');
    f.componentInstance.locked.set(true);
    await f.whenStable();
    expect(fieldset.disabled).toBe(true);
    f.destroy();
    expect(fieldset.classList).not.toContain('aui-fieldset');
  });

  it('<aui-badge> renders and updates its label', async () => {
    const f = await render(Host);
    const badge = (f.nativeElement as HTMLElement).querySelector('aui-badge')!;
    expect(badge.textContent).toBe('Active');
    f.componentInstance.status.set('Suspended');
    await f.whenStable();
    expect(badge.textContent).toBe('Suspended');
  });
});

@Component({
  imports: [AuiButton],
  template: `<button type="button" auiButton [(pressed)]="bold">Bold</button>`,
})
class ToggleHost {
  readonly bold = signal(false);
}

describe('R13 toggle button binding', () => {
  it('button[auiButton] supports two-way [(pressed)]', async () => {
    const f = await render(ToggleHost);
    const button = (f.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    await f.whenStable();
    expect(f.componentInstance.bold()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    f.componentInstance.bold.set(false);
    await f.whenStable();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});

@Component({
  imports: [AuiScrollArea],
  template: `<div auiScrollArea label="Activity" maxBlockSize="40px">
    @for (line of lines(); track line) {
      <p style="margin: 0; block-size: 20px">{{ line }}</p>
    }
  </div>`,
})
class ScrollHost {
  readonly lines = signal(['a']);
}

describe('R13 scroll area binding', () => {
  it('[auiScrollArea] becomes a focusable region once projected content overflows', async () => {
    const f = await render(ScrollHost);
    const el = (f.nativeElement as HTMLElement).querySelector<HTMLElement>('[auiscrollarea]')!;
    expect(el.classList).toContain('aui-scroll-area');
    expect(el.hasAttribute('tabindex')).toBe(false);
    f.componentInstance.lines.set(['a', 'b', 'c', 'd', 'e', 'f']);
    await f.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(el.getAttribute('role')).toBe('region');
    expect(el.getAttribute('aria-label')).toBe('Activity');
    expect(el.getAttribute('tabindex')).toBe('0');
  });
});
