import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { getIconAnimation, type IconAnimationState, type IconVariantName } from '@absoluteui/icons';
import { downloadIcon, lockOverlay, spinnerIcon } from '@absoluteui/icons/set';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiIcon, type AuiIconAnimation, type AuiIconColors } from '../src/icon/index.js';

// docs/PLAN-R16-ICONS.md M3: vector inputs, update in place, animation lifecycle.
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
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

@Component({
  imports: [AuiIcon],
  template: `
    <aui-icon class="dl" [name]="download" [variant]="variant()" [colors]="colors()" [strokeWidth]="stroke()" [label]="label()" />
    <aui-icon class="locked" [name]="download" [overlays]="[{ icon: lock }]" container="circle" />
    <aui-icon class="spin" #spin="auiIcon" [name]="spinner" [animation]="animation()" [animationState]="state()" />
  `,
})
class IconHost {
  readonly download = downloadIcon;
  readonly spinner = spinnerIcon;
  readonly lock = lockOverlay;
  readonly variant = signal<IconVariantName>('duotone');
  readonly colors = signal<AuiIconColors | undefined>({ accent: '#16a34a' });
  readonly stroke = signal<number | undefined>(undefined);
  readonly label = signal<string | undefined>(undefined);
  readonly animation = signal<AuiIconAnimation | undefined>({ preset: 'spin' });
  readonly state = signal<IconAnimationState>('idle');
}

const svg = (root: HTMLElement, selector: string): SVGSVGElement => {
  const el = root.querySelector(`${selector} > svg`);
  if (!(el instanceof SVGSVGElement)) throw new Error(`no icon in ${selector}`);
  return el;
};

describe('aui-icon with vector icons (R16 M3)', () => {
  it('renders a set icon with its variant, colors, overlay, and container', async () => {
    const f = await render(IconHost);
    const el = f.nativeElement as HTMLElement;
    const icon = svg(el, '.dl');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('g[data-layer="secondary"]')).not.toBeNull();
    expect(icon.style.getPropertyValue('--aui-icon-accent')).toBe('#16a34a');
    expect(svg(el, '.locked').querySelector('[data-overlay="lock"]')).not.toBeNull();
  });

  it('updates colors, stroke width, and label in place; a new variant renders again', async () => {
    const f = await render(IconHost);
    const el = f.nativeElement as HTMLElement;
    const first = svg(el, '.dl');
    f.componentInstance.colors.set({ accent: '#dc2626' });
    f.componentInstance.stroke.set(1.5);
    f.componentInstance.label.set('Download');
    await f.whenStable();
    expect(svg(el, '.dl')).toBe(first);
    expect(first.style.getPropertyValue('--aui-icon-accent')).toBe('#dc2626');
    expect(first.style.getPropertyValue('stroke-width')).toBe('1.5');
    expect(first.getAttribute('aria-label')).toBe('Download');
    f.componentInstance.colors.set(undefined);
    await f.whenStable();
    expect(first.style.getPropertyValue('--aui-icon-accent')).toBe('');
    f.componentInstance.stroke.set(undefined);
    await f.whenStable();
    expect(svg(el, '.dl')).not.toBe(first);
    const second = svg(el, '.dl');
    f.componentInstance.variant.set('outline');
    await f.whenStable();
    expect(svg(el, '.dl')).not.toBe(second);
    expect(svg(el, '.dl').querySelector('g[data-layer="secondary"]')).toBeNull();
  });

  it('drives the animation from animationState and disposes it on destroy', async () => {
    const f = await render(IconHost);
    const el = f.nativeElement as HTMLElement;
    const icon = svg(el, '.spin');
    expect(getIconAnimation(icon)?.state).toBe('idle');
    f.componentInstance.state.set('loading');
    await f.whenStable();
    expect(getIconAnimation(icon)?.state).toBe('running');
    f.componentInstance.state.set('idle');
    await f.whenStable();
    expect(getIconAnimation(icon)?.state).toBe('idle');
    f.componentInstance.animation.set(undefined);
    await f.whenStable();
    expect(getIconAnimation(icon)).toBeUndefined();
    f.componentInstance.animation.set({ preset: 'spin' });
    await f.whenStable();
    expect(getIconAnimation(icon)).toBeDefined();
    f.destroy();
    expect(getIconAnimation(icon)).toBeUndefined();
  });
});
