/* eslint-disable @typescript-eslint/unbound-method -- Angular validators are static functions passed by reference */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type AsyncValidatorFn,
  type ValidationErrors,
} from '@angular/forms';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiButton } from '../src/button/index.js';
import { AuiCheckbox } from '../src/checkbox/index.js';
import { provideAuiFormErrors } from '../src/forms/index.js';
import { AuiRadioGroup } from '../src/radio-group/index.js';
import { AuiSwitch } from '../src/switch/index.js';
import { AuiTextInput } from '../src/text-input/index.js';
import { AuiTextarea } from '../src/textarea/index.js';

// docs/PLAN-R9-ANGULAR.md M2: Button reference and the forms layer on the reference controls.
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

async function render<T>(type: new () => T, providers: unknown[] = []): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false }), ...(providers as never[])] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

const errorText = (host: Element): string => host.querySelector('.aui-field__error')?.textContent.trim() ?? '';
const noTaken: (c: AbstractControl) => ValidationErrors | null = (c) => (c.value === 'admin' ? { taken: true } : null);

@Component({
  imports: [ReactiveFormsModule, AuiTextInput, AuiTextarea, AuiCheckbox, AuiRadioGroup, AuiSwitch],
  template: `
    <form [formGroup]="form" (ngSubmit)="submits.set(submits() + 1)">
      <aui-text-input class="name" label="Name" formControlName="name"></aui-text-input>
      <aui-text-input class="email" label="Email" formControlName="email"></aui-text-input>
      <aui-textarea class="bio" label="Bio" formControlName="bio"></aui-textarea>
      <aui-checkbox class="terms" label="Terms" formControlName="terms"></aui-checkbox>
      <aui-radio-group class="plan" label="Plan" [options]="plans" formControlName="plan"></aui-radio-group>
      <aui-switch class="news" label="Newsletter" formControlName="news"></aui-switch>
      <button type="submit">Save</button>
    </form>
  `,
})
class ReactiveHost {
  readonly plans = [
    { value: 'free', label: 'Free' },
    { value: 'pro', label: 'Pro' },
  ];
  readonly submits = signal(0);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, noTaken] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    bio: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5)] }),
    terms: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
    plan: new FormControl<string | null>(null),
    news: new FormControl(false, { nonNullable: true }),
  });
}

describe('forms layer: reactive forms (M2)', () => {
  it('binds every reference control both ways', async () => {
    const f = await render(ReactiveHost);
    const el = f.nativeElement as HTMLElement;
    const form = f.componentInstance.form;
    form.patchValue({ name: 'Ada', bio: 'Hi', terms: true, plan: 'pro', news: true });
    await f.whenStable();
    expect(el.querySelector<HTMLInputElement>('.name input')!.value).toBe('Ada');
    expect(el.querySelector<HTMLTextAreaElement>('.bio textarea')!.value).toBe('Hi');
    expect(el.querySelector<HTMLInputElement>('.terms input')!.checked).toBe(true);
    expect(el.querySelector<HTMLInputElement>('.plan input[value="pro"]')!.checked).toBe(true);
    expect(el.querySelector<HTMLInputElement>('.news input')!.checked).toBe(true);

    await userEvent.click(el.querySelectorAll<HTMLElement>('.plan label')[0]!);
    await userEvent.click(el.querySelector<HTMLElement>('.news label')!);
    await userEvent.click(el.querySelector<HTMLElement>('.terms .aui-checkbox__label')!);
    await userEvent.click(el.querySelector('.bio textarea')!);
    await userEvent.keyboard('{End}!');
    expect(form.getRawValue()).toMatchObject({ plan: 'free', news: false, terms: false, bio: 'Hi!' });
    expect(form.controls.bio.dirty).toBe(true);
  });

  it('Validators.required marks the component required', async () => {
    const f = await render(ReactiveHost);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLInputElement>('.name input')!.required).toBe(true);
    expect(el.querySelector<HTMLInputElement>('.email input')!.required).toBe(false);
    f.componentInstance.form.controls.email.addValidators(Validators.required);
    f.componentInstance.form.controls.email.updateValueAndValidity();
    await f.whenStable();
    expect(el.querySelector<HTMLInputElement>('.email input')!.required).toBe(true);
  });

  it('submission shows messages; reset clears them and restores the form value', async () => {
    const f = await render(ReactiveHost);
    const el = f.nativeElement as HTMLElement;
    expect(errorText(el.querySelector('.name')!)).toBe('');
    await userEvent.click(el.querySelector('button[type="submit"]')!);
    await f.whenStable();
    expect(f.componentInstance.submits()).toBe(1);
    expect(errorText(el.querySelector('.name')!)).not.toBe('');
    expect(errorText(el.querySelector('.terms')!)).not.toBe('');

    f.componentInstance.form.reset({ name: 'Grace', email: '', bio: '', terms: false, plan: null, news: false });
    await f.whenStable();
    expect(errorText(el.querySelector('.name')!)).toBe('');
    expect(errorText(el.querySelector('.terms')!)).toBe('');
    expect(el.querySelector<HTMLInputElement>('.name input')!.value).toBe('Grace');
  });

  it('markAllAsTouched shows messages', async () => {
    const f = await render(ReactiveHost);
    const el = f.nativeElement as HTMLElement;
    f.componentInstance.form.markAllAsTouched();
    await f.whenStable();
    expect(errorText(el.querySelector('.name')!)).not.toBe('');
  });

  it('shows Angular validator errors in the component, with built-in and custom messages', async () => {
    const f = await render(ReactiveHost, [provideAuiFormErrors({ taken: 'This name is taken.' })]);
    const el = f.nativeElement as HTMLElement;
    const form = f.componentInstance.form;
    await userEvent.click(el.querySelector('.email input')!);
    await userEvent.keyboard('not-an-email');
    await userEvent.tab();
    await f.whenStable();
    expect(errorText(el.querySelector('.email')!)).toBe('Enter a valid email address.');
    // The message is not reported back to Angular as a component error.
    expect(form.controls.email.errors).toEqual({ email: true });

    await userEvent.click(el.querySelector('.name input')!);
    await userEvent.keyboard('admin');
    await userEvent.tab();
    await f.whenStable();
    expect(errorText(el.querySelector('.name')!)).toBe('This name is taken.');

    form.controls.name.setValue('Ada');
    await f.whenStable();
    expect(errorText(el.querySelector('.name')!)).toBe('');
    expect(form.controls.name.valid).toBe(true);

    await userEvent.click(el.querySelector('.bio textarea')!);
    await userEvent.keyboard('toolong');
    await userEvent.tab();
    await f.whenStable();
    expect(errorText(el.querySelector('.bio')!)).toBe('Enter no more than 5 characters.');
  });
});

@Component({
  imports: [ReactiveFormsModule, AuiTextInput],
  template: `
    <aui-text-input class="slow" label="Username" [formControl]="username" #field="auiTextInput"></aui-text-input>
    <aui-text-input class="blur" label="City" [formControl]="city"></aui-text-input>
  `,
})
class AsyncHost {
  release: (errors: ValidationErrors | null) => void = () => undefined;
  readonly check: AsyncValidatorFn = () =>
    new Promise<ValidationErrors | null>((resolve) => {
      this.release = resolve;
    });
  readonly username = new FormControl('', { nonNullable: true, asyncValidators: [this.check] });
  readonly city = new FormControl('', { nonNullable: true, updateOn: 'blur' });
  readonly field = viewChild.required<AuiTextInput>('field');
}

describe('forms layer: async validation and updateOn (M2)', () => {
  it('marks the component busy while an async validator runs', async () => {
    const f = await render(AsyncHost);
    const el = f.nativeElement as HTMLElement;
    const host = el.querySelector('.slow')!;
    await userEvent.click(host.querySelector('input')!);
    await userEvent.keyboard('ada');
    await f.whenStable();
    expect(f.componentInstance.username.pending).toBe(true);
    expect(f.componentInstance.field().formState.pending()).toBe(true);
    expect(host.getAttribute('aria-busy')).toBe('true');
    f.componentInstance.release({ taken: true });
    // The validator settles asynchronously.
    await expect.poll(() => f.componentInstance.field().formState.pending()).toBe(false);
    await f.whenStable();
    expect(host.hasAttribute('aria-busy')).toBe(false);
    await userEvent.tab();
    await f.whenStable();
    expect(f.componentInstance.field().formState.errorState()).toBe(true);
    expect(errorText(host)).toBe('This value is not valid.');
  });

  it("updateOn: 'blur' commits the value when focus leaves", async () => {
    const f = await render(AsyncHost);
    const el = f.nativeElement as HTMLElement;
    await userEvent.click(el.querySelector('.blur input')!);
    await userEvent.keyboard('Pune');
    expect(f.componentInstance.city.value).toBe('');
    await userEvent.tab();
    expect(f.componentInstance.city.value).toBe('Pune');
  });
});

@Component({
  imports: [FormsModule, AuiTextInput, AuiSwitch],
  template: `
    <form #ngf="ngForm" (ngSubmit)="saved.set(true)">
      <aui-text-input class="nick" label="Nickname" name="nick" [(ngModel)]="nick" required></aui-text-input>
      <aui-switch class="dark" label="Dark mode" name="dark" [(ngModel)]="dark"></aui-switch>
      <button type="submit">Save</button>
    </form>
    <aui-text-input class="plain" label="Plain" [(value)]="plain"></aui-text-input>
  `,
})
class TemplateHost {
  nick = '';
  dark = false;
  readonly plain = signal('x');
  readonly saved = signal(false);
}

describe('forms layer: template-driven forms and models (M2)', () => {
  it('[(ngModel)] binds, required shows on submit, [(value)] works without forms', async () => {
    const f = await render(TemplateHost);
    const el = f.nativeElement as HTMLElement;
    await userEvent.click(el.querySelector('button[type="submit"]')!);
    await f.whenStable();
    expect(errorText(el.querySelector('.nick')!)).not.toBe('');
    await userEvent.click(el.querySelector('.nick input')!);
    await userEvent.keyboard('Ada');
    await userEvent.click(el.querySelector('.dark label')!);
    await f.whenStable();
    expect(f.componentInstance.nick).toBe('Ada');
    expect(f.componentInstance.dark).toBe(true);
    expect(errorText(el.querySelector('.nick')!)).toBe('');
    await userEvent.click(el.querySelector('.plain input')!);
    await userEvent.keyboard('{End}y');
    expect(f.componentInstance.plain()).toBe('xy');
  });
});

@Component({
  imports: [AuiButton],
  template: `
    <button class="save" auiButton variant="primary" [loading]="busy()">Save</button>
    <button class="out" auiButton variant="outline" size="sm" fullWidth>More</button>
    <button class="del" auiButton variant="danger" disabled>Delete</button>
    <button class="ico" auiButton icon="close" label="Close"></button>
    <button class="cfg" auiButton>Default</button>
  `,
})
class ButtonHost {
  readonly busy = signal(false);
}

describe('Button reference (M2)', () => {
  it('variants, sizes, full width, disabled, icon-only label, configuration precedence', async () => {
    const f = await render(ButtonHost, [provideAbsoluteUI({ themeRuntime: false, components: { button: { size: 'lg' } } })]);
    const el = f.nativeElement as HTMLElement;
    const out = el.querySelector('.out')!;
    expect(out.classList).toContain('aui-button--outline');
    expect(out.classList).toContain('aui-button--sm');
    expect(out.classList).toContain('aui-button--full-width');
    expect(getComputedStyle(out).display).toBe('flex');
    expect(el.querySelector<HTMLButtonElement>('.del')!.disabled).toBe(true);
    expect(el.querySelector('.ico')!.getAttribute('aria-label')).toBe('Close');
    // App configuration applies where no local input is bound.
    expect(el.querySelector('.cfg')!.classList).toContain('aui-button--lg');
    expect(el.querySelector('.cfg')!.classList).toContain('aui-button--secondary');
  });

  it('loading blocks activation and is announced', async () => {
    const f = await render(ButtonHost);
    const el = f.nativeElement as HTMLElement;
    const save = el.querySelector<HTMLButtonElement>('.save')!;
    let clicks = 0;
    save.addEventListener('click', () => clicks++);
    f.componentInstance.busy.set(true);
    await f.whenStable();
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(save.textContent).toContain('Loading');
    save.click();
    expect(clicks).toBe(0);
    f.componentInstance.busy.set(false);
    await f.whenStable();
    save.click();
    expect(clicks).toBe(1);
  });
});
