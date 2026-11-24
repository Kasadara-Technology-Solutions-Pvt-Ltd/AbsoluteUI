import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { getCommonConfig, resetAbsoluteUIConfig } from '@absoluteui/core';
import type { MenuItem, MenuSelectDetail } from '@absoluteui/components/menu';
import type { FormSubmitDetail } from '@absoluteui/components/form';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiTextInput } from '../src/text-input/index.js';
import { AuiCheckbox } from '../src/checkbox/index.js';
import { AuiSelect } from '../src/select/index.js';
import { AuiButton } from '../src/button/index.js';
import { AuiDialog } from '../src/dialog/index.js';
import { AuiMenu } from '../src/menu/index.js';
import { AuiTooltip } from '../src/tooltip/index.js';
import { AuiPopover } from '../src/popover/index.js';
import { AuiForm } from '../src/form/index.js';
import { AuiTabs } from '../src/tabs/index.js';
import { AuiStack } from '../src/layout/index.js';
import { AuiToaster } from '../src/toast/index.js';

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ locale: 'en-US', themeRuntime: false })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

@Component({
  imports: [ReactiveFormsModule, AuiTextInput, AuiCheckbox, AuiSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form">
      <aui-text-input label="Email" type="email" [required]="true" formControlName="email"></aui-text-input>
      <aui-checkbox label="Terms" [required]="true" formControlName="terms"></aui-checkbox>
      <aui-select label="Role" [options]="roles" formControlName="role"></aui-select>
    </form>
  `,
})
class FormsHost {
  readonly roles = [{ value: 'dev', label: 'Developer' }, { value: 'pm', label: 'Product' }];
  readonly form = new FormGroup({
    email: new FormControl('ada@example.com', { nonNullable: true, validators: [(c) => Validators.required(c)] }),
    terms: new FormControl(false, { nonNullable: true }),
    role: new FormControl<string | null>('pm'),
  });
}

describe('Angular adapter: forms (ControlValueAccessor + Validator)', () => {
  it('writes model values, propagates user input, and mirrors component validity', async () => {
    const f = await render(FormsHost);
    const el = f.nativeElement as HTMLElement;
    const email = el.querySelector<HTMLInputElement>('.aui-text-input__input')!;
    expect(email.value).toBe('ada@example.com');
    expect(el.querySelector('[role="combobox"]')!.textContent).toContain('Product');
    const form = f.componentInstance.form;
    expect(form.controls.terms.errors).toEqual({ aui: { error: 'value-missing', message: 'Check this box to continue.' } });
    await userEvent.click(email);
    await userEvent.keyboard('{Control>}a{/Control}not-an-email');
    expect(form.controls.email.value).toBe('not-an-email');
    expect(form.controls.email.errors?.aui).toMatchObject({ error: 'type-mismatch' });
    // The native input is visually hidden by the bundled component CSS; users click the label.
    await userEvent.click(el.querySelector<HTMLElement>('.aui-checkbox__label')!);
    expect(form.controls.terms.value).toBe(true);
    expect(form.controls.terms.valid).toBe(true);
  });

  it('model changes and disable() reach the component', async () => {
    const f = await render(FormsHost);
    const el = f.nativeElement as HTMLElement;
    const form = f.componentInstance.form;
    form.controls.email.setValue('grace@example.com');
    form.controls.email.disable();
    await f.whenStable();
    const email = el.querySelector<HTMLInputElement>('.aui-text-input__input')!;
    expect(email.value).toBe('grace@example.com');
    expect(email.disabled).toBe(true);
  });

  it('marks the control touched when focus leaves the component', async () => {
    const f = await render(FormsHost);
    const el = f.nativeElement as HTMLElement;
    await userEvent.click(el.querySelector<HTMLInputElement>('.aui-text-input__input')!);
    await userEvent.tab();
    expect(f.componentInstance.form.controls.email.touched).toBe(true);
  });
});

@Component({
  imports: [AuiButton, AuiDialog, AuiMenu, AuiTooltip, AuiPopover, AuiTabs, AuiStack],
  template: `
    <div auiStack [gap]="4">
      <button auiButton variant="primary" (click)="open.set(true)">Open</button>
      <button [auiMenu]="items" (selected)="selected.set($event.id)">Actions</button>
      <button auiButton icon="info" label="Help" auiTooltip="Opens help" [tooltipShowDelay]="0"></button>
      <button [auiPopover]="pop" popoverTitle="Filters">Filters</button>
      <ng-template #pop><p class="pop-content">Count: {{ count() }}</p></ng-template>
      <aui-tabs label="Sections" [tabs]="tabs" (changed)="tab.set($event.value)"></aui-tabs>
    </div>
    <aui-dialog title="Confirm" [open]="open()" (closed)="open.set(false)">
      <p class="dialog-content">Delete {{ count() }} items?</p>
    </aui-dialog>
  `,
})
class OverlaysHost {
  readonly open = signal(false);
  readonly count = signal(3);
  readonly selected = signal('');
  readonly tab = signal('');
  readonly items: MenuItem[] = [{ id: 'edit', label: 'Edit' }, { id: 'delete', label: 'Delete' }];
  readonly tabs = [
    { id: 'a', label: 'Alpha', content: 'A panel' },
    { id: 'b', label: 'Beta', content: 'B panel' },
  ];
}

describe('Angular adapter: overlays, navigation, layout', () => {
  it('enhances buttons and applies layout without taking over Angular content', async () => {
    const f = await render(OverlaysHost);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('button')!.className).toContain('aui-button--primary');
    expect(el.querySelector('div')!.classList.contains('aui-stack')).toBe(true);
    expect(el.querySelector('button')!.textContent).toContain('Open');
  });

  it('dialog renders the template as its body and follows the open input', async () => {
    const f = await render(OverlaysHost);
    f.componentInstance.open.set(true);
    await f.whenStable();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.aui-dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.dialog-content')!.textContent).toBe('Delete 3 items?');
    f.componentInstance.count.set(5);
    await f.whenStable();
    expect(dialog.querySelector('.dialog-content')!.textContent).toBe('Delete 5 items?');
    await userEvent.keyboard('{Escape}');
    expect(dialog.open).toBe(false);
    await f.whenStable();
    expect(f.componentInstance.open()).toBe(false);
  });

  it('menu emits auiSelect; tabs emit auiChange', async () => {
    const f = await render(OverlaysHost);
    const el = f.nativeElement as HTMLElement;
    const trigger = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Actions')!;
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(f.componentInstance.selected()).toBe('delete');
    await userEvent.click(el.querySelector<HTMLElement>('[role="tab"]:nth-child(2)')!);
    expect(f.componentInstance.tab()).toBe('b');
  });

  it('popover content stays a live embedded view', async () => {
    const f = await render(OverlaysHost);
    const el = f.nativeElement as HTMLElement;
    const trigger = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Filters')!;
    await userEvent.click(trigger);
    const popup = document.querySelector('.aui-popover')!;
    expect(popup.querySelector('.pop-content')!.textContent).toBe('Count: 3');
    f.componentInstance.count.set(9);
    await f.whenStable();
    expect(popup.querySelector('.pop-content')!.textContent).toBe('Count: 9');
  });

  it('tooltip describes its trigger', async () => {
    const f = await render(OverlaysHost);
    const help = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[aria-label="Help"]')!;
    const tooltip = document.getElementById(help.getAttribute('aria-describedby')!.split(' ')[0]!)!;
    expect(tooltip.textContent).toBe('Opens help');
  });

  it('destroying the host destroys controllers and removes overlays', async () => {
    const f = await render(OverlaysHost);
    expect(document.querySelector('dialog.aui-dialog')).not.toBeNull();
    f.destroy();
    expect(document.querySelector('dialog.aui-dialog')).toBeNull();
    expect(document.querySelector('.aui-tooltip')).toBeNull();
  });
});

@Component({
  imports: [ReactiveFormsModule, AuiForm, AuiTextInput],
  template: `
    <form auiForm [formGroup]="group" (submitted)="submitted.set($event)">
      <aui-text-input label="Name" name="name" [required]="true" formControlName="name"></aui-text-input>
      <button type="submit">Save</button>
    </form>
  `,
})
class AuiFormHost {
  readonly group = new FormGroup({ name: new FormControl('', { nonNullable: true }) });
  readonly submitted = signal<FormSubmitDetail | null>(null);
}

describe('Angular adapter: auiForm and providers', () => {
  it('blocks invalid submission with a summary, then emits auiSubmit with values', async () => {
    const f = await render(AuiFormHost);
    const el = f.nativeElement as HTMLElement;
    await userEvent.click(el.querySelector('button')!);
    expect(el.querySelector('.aui-error-summary')).not.toBeNull();
    expect(f.componentInstance.submitted()).toBeNull();
    await userEvent.click(el.querySelector<HTMLInputElement>('.aui-text-input__input')!);
    await userEvent.keyboard('Ada');
    await userEvent.click(el.querySelector('button')!);
    expect(f.componentInstance.submitted()).toEqual({ values: { name: 'Ada' } });
  });

  it('provideAbsoluteUI applies global configuration; AuiToaster shows toasts', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ timezone: 'Asia/Kolkata', themeRuntime: false })] });
    TestBed.createComponent(AuiFormHost);
    expect(getCommonConfig().timezone).toBe('Asia/Kolkata');
    const handle = TestBed.inject(AuiToaster).show({ message: 'Saved', duration: 0 });
    expect(handle).not.toBeNull();
    expect(document.querySelector('.aui-toast')?.textContent).toContain('Saved');
  });

  it('menu select detail is typed', () => {
    const detail: MenuSelectDetail = { id: 'x', item: { id: 'x', label: 'X' } };
    expect(detail.id).toBe('x');
  });
});
