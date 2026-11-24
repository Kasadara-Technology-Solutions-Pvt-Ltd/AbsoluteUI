import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { CascaderValue } from '@absoluteui/components/cascader';
import type { MentionInputValue } from '@absoluteui/components/mention-input';
import type { RatingValue } from '@absoluteui/components/rating';
import type { SignaturePadValue } from '@absoluteui/components/signature-pad';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiCascader } from '../src/cascader/index.js';
import { AuiColorPicker } from '../src/color-picker/index.js';
import { AuiMaskedInput } from '../src/masked-input/index.js';
import { AuiMentionInput } from '../src/mention-input/index.js';
import { AuiRating } from '../src/rating/index.js';
import { AuiSignaturePad } from '../src/signature-pad/index.js';
import { AuiTransferList } from '../src/transfer-list/index.js';

// R20 P9 (docs/PLAN-R20.md): generated bindings of the new form controls.
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
  imports: [ReactiveFormsModule, AuiCascader, AuiColorPicker, AuiMaskedInput, AuiMentionInput, AuiRating, AuiSignaturePad, AuiTransferList],
  template: `
    <aui-color-picker label="Brand color" mode="inline" [formControl]="color"></aui-color-picker>
    <aui-rating label="Score" [formControl]="score"></aui-rating>
    <aui-transfer-list label="Team" [items]="people" [formControl]="team"></aui-transfer-list>
    <aui-cascader label="Location" [options]="places" [formControl]="place"></aui-cascader>
    <aui-mention-input label="Comment" [triggers]="triggers" [formControl]="comment"></aui-mention-input>
    <aui-signature-pad label="Signature" [formControl]="signature"></aui-signature-pad>
    <aui-masked-input label="Phone" mask="(999) 999-9999" [formControl]="phone"></aui-masked-input>
    <aui-rating label="Bound" [(value)]="bound"></aui-rating>
  `,
})
class Host {
  readonly color = new FormControl<string | null>('#2563eb');
  readonly score = new FormControl<RatingValue>(3);
  readonly team = new FormControl<string[]>(['ana']);
  readonly place = new FormControl<CascaderValue>(['de', 'by']);
  readonly comment = new FormControl<MentionInputValue>({ text: 'Hi', mentions: [] });
  readonly signature = new FormControl<SignaturePadValue>(null);
  readonly phone = new FormControl<string>('5550100199');
  readonly bound = signal<RatingValue | undefined>(2);
  readonly people = [
    { value: 'ana', label: 'Ana Ruiz' },
    { value: 'ben', label: 'Ben Okafor' },
  ];
  readonly places = [{ value: 'de', label: 'Germany', children: [{ value: 'by', label: 'Bavaria' }] }];
  readonly triggers = [{ char: '@', provider: (): Promise<{ id: string; label: string }[]> => Promise.resolve([{ id: 'ana', label: 'Ana Ruiz' }]) }];
}

describe('R20 P9 Angular bindings', () => {
  it('every new control renders and reflects its form control value', async () => {
    const f = await render(Host);
    const root = f.nativeElement as HTMLElement;
    for (const tag of ['aui-color-picker', 'aui-rating', 'aui-transfer-list', 'aui-cascader', 'aui-mention-input', 'aui-signature-pad', 'aui-masked-input']) {
      expect(root.querySelector(tag)?.childElementCount, tag).toBeGreaterThan(0);
    }
    expect(root.querySelector('aui-rating [role="slider"]')!.getAttribute('aria-valuenow')).toBe('3');
    expect(root.querySelector<HTMLInputElement>('aui-masked-input input:not([type="hidden"])')!.value).toBe('(555) 010-0199');
    f.componentInstance.score.setValue(5);
    await f.whenStable();
    expect(root.querySelector('aui-rating [role="slider"]')!.getAttribute('aria-valuenow')).toBe('5');
  });

  it('[(value)] two-way binding on rating', async () => {
    const f = await render(Host);
    const slider = (f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('aui-rating [role="slider"]')[1]!;
    expect(slider.getAttribute('aria-valuenow')).toBe('2');
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    await f.whenStable();
    expect(f.componentInstance.bound()).toBe(3);
  });

  it('disabling a form control disables the component', async () => {
    const f = await render(Host);
    f.componentInstance.score.disable();
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('aui-rating [role="slider"]')!.getAttribute('aria-disabled')).toBe('true');
  });
});
