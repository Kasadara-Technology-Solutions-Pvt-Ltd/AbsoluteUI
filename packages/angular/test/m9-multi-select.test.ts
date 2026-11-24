import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { MultiSelectChangeDetail, MultiSelectOption } from '@absoluteui/components/multi-select';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiMultiSelect } from '../src/multi-select/index.js';
import { AuiItem } from '../src/templates/index.js';
import { AuiMultiSelectHarness } from '../src/testing/index.js';

// docs/PLAN-R9-ANGULAR.md M9 (D33): Multi Select.
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

const skills: MultiSelectOption[] = [
  { value: 'ts', label: 'TypeScript' },
  { value: 'sql', label: 'SQL' },
  { value: 'ux', label: 'UX research' },
];

@Component({
  imports: [ReactiveFormsModule, AuiMultiSelect, AuiItem],
  template: `
    <aui-multi-select #ms="auiMultiSelect" label="Skills" [options]="skills" [selectAll]="true" [formControl]="chosen" (changed)="log.push($event)">
      <ng-template auiItem [auiItemOf]="skills" let-option>
        <b class="custom">{{ option.label }}!</b>
      </ng-template>
    </aui-multi-select>
    <span class="open">{{ ms.isOpen() }}</span>
  `,
})
class FormHost {
  readonly skills = skills;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Angular validator functions are static and unbound by design.
  readonly chosen = new FormControl<string[]>(['sql'], { nonNullable: true, validators: [Validators.required] });
  readonly log: MultiSelectChangeDetail[] = [];
}

@Component({
  imports: [AuiMultiSelect],
  template: `<aui-multi-select label="Skills" [options]="skills" [(value)]="value" [maxSelected]="max()"></aui-multi-select>`,
})
class ModelHost {
  readonly skills = skills;
  readonly value = signal<string[] | undefined>(['ts']);
  readonly max = signal<number | undefined>(undefined);
}

const optionEls = (root: HTMLElement): HTMLElement[] => Array.from(root.ownerDocument.querySelectorAll<HTMLElement>('.aui-multi-select__listbox [role="option"]'));
const chips = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('.aui-multi-select__chip-label'), (c) => c.textContent);

describe('AuiMultiSelect (M9 D33)', () => {
  it('binds a reactive form control both ways, validates, renders option templates, and reports isOpen', async () => {
    const f = await render(FormHost);
    const root = f.nativeElement as HTMLElement;
    const host = f.componentInstance;
    expect(chips(root)).toEqual(['SQL']);
    host.chosen.setValue(['ts', 'ux']);
    await f.whenStable();
    expect(chips(root)).toEqual(['TypeScript', 'UX research']);
    host.chosen.setValue([]);
    expect(host.chosen.hasError('required')).toBe(true);

    root.querySelector<HTMLButtonElement>('.aui-multi-select__toggle')!.click();
    await f.whenStable();
    expect(root.querySelector('.open')!.textContent).toBe('true');
    const opts = optionEls(root);
    expect(opts[0]!.textContent).toBe('Select all');
    expect(opts[1]!.querySelector('.custom')!.textContent).toBe('TypeScript!');
    expect(opts[1]!.getAttribute('aria-label')).toBe('TypeScript');
    opts[2]!.click();
    await f.whenStable();
    expect(host.chosen.value).toEqual(['sql']);
    expect(host.chosen.dirty).toBe(true);
    expect(host.log).toEqual([{ value: ['sql'], added: ['sql'], removed: [] }]);
    // Options re-render after each toggle: query again.
    optionEls(root)[0]!.click();
    await f.whenStable();
    expect(host.chosen.value).toEqual(['sql', 'ts', 'ux']);

    host.chosen.disable();
    await f.whenStable();
    expect(root.querySelector<HTMLInputElement>('.aui-multi-select__input')!.disabled).toBe(true);
  });

  it('[(value)] without forms; option inputs update the controller', async () => {
    const f = await render(ModelHost);
    const root = f.nativeElement as HTMLElement;
    const host = f.componentInstance;
    expect(chips(root)).toEqual(['TypeScript']);
    host.value.set(['sql', 'ts']);
    host.max.set(2);
    await f.whenStable();
    expect(chips(root)).toEqual(['SQL', 'TypeScript']);
    root.querySelector<HTMLButtonElement>('.aui-multi-select__remove[data-value="sql"]')!.click();
    await f.whenStable();
    expect(host.value()).toEqual(['ts']);
  });
  it('AuiMultiSelectHarness toggles options, reads chips, and removes values', async () => {
    const f = await render(ModelHost);
    const ms = await TestbedHarnessEnvironment.loader(f).getHarness(AuiMultiSelectHarness.with({ label: 'Skills' }));
    expect(await ms.getSelectedLabels()).toEqual(['TypeScript']);
    await ms.toggleOption('SQL');
    expect(await ms.isOpen()).toBe(true);
    expect(await ms.getOptionLabels()).toEqual(['TypeScript', 'SQL', 'UX research']);
    await ms.close();
    expect(await ms.isOpen()).toBe(false);
    expect(f.componentInstance.value()).toEqual(['ts', 'sql']);
    await ms.removeValue('TypeScript');
    expect(await ms.getSelectedLabels()).toEqual(['SQL']);
    expect(f.componentInstance.value()).toEqual(['sql']);
  });
});
