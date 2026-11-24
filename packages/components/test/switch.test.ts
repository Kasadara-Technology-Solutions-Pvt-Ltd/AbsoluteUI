import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Switch, type SwitchChangeDetail, type SwitchOptions } from '@absoluteui/components/switch';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<SwitchOptions> = {}): Switch {
  const host = document.createElement('div');
  document.body.append(host);
  return Switch.create(host, { label: 'Wi-Fi', ...options });
}

const errorText = (s: Switch): string => s.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const label = (s: Switch): HTMLLabelElement => s.host.querySelector('label')!;

describe('Switch: semantics', () => {
  it('is a native checkbox with role=switch, labelled and described', () => {
    const s = mount({ description: 'Uses more battery', name: 'wifi', checked: true });
    expect(s.input.type).toBe('checkbox');
    expect(s.input.getAttribute('role')).toBe('switch');
    expect(s.input.checked).toBe(true);
    expect(label(s).htmlFor).toBe(s.input.id);
    expect(label(s).textContent).toBe('Wi-Fi*');
    expect(label(s).querySelector<HTMLElement>('.aui-field__required')!.hidden).toBe(true);
    expect(s.input.required).toBe(false);
    expect(s.input.name).toBe('wifi');
    expect(document.getElementById(s.input.getAttribute('aria-describedby')!)!.textContent).toBe('Uses more battery');
    expect(s.host.querySelector('.aui-switch__thumb')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('requires a label and validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Switch.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => Switch.create(host, { label: 'x', value: 2 as unknown as string })).toThrow(/value/);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('data-aui-control')).toBe(false);
  });

  it('visually hides the label on request', () => {
    const s = mount({ hideLabel: true });
    expect(label(s).classList.contains('aui-visually-hidden')).toBe(true);
  });
});

describe('Switch: keyboard, pointer, events', () => {
  it('toggles with Space and emits a bubbling aui-change with checked and value', async () => {
    const s = mount({ value: 'enabled' });
    const changes: SwitchChangeDetail[] = [];
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<SwitchChangeDetail>).detail));
    await userEvent.tab();
    expect(document.activeElement).toBe(s.input);
    await userEvent.keyboard(' ');
    await userEvent.keyboard(' ');
    expect(changes).toEqual([{ checked: true, value: 'enabled' }, { checked: false, value: 'enabled' }]);
  });

  it('toggles when the label is clicked; programmatic changes emit nothing', async () => {
    const s = mount();
    let count = 0;
    s.host.addEventListener('aui-change', () => {
      count++;
    });
    await userEvent.click(label(s));
    expect(s.checked).toBe(true);
    s.setChecked(false);
    s.update({ checked: true });
    expect(count).toBe(1);
  });

  it('does not toggle when disabled', () => {
    const s = mount({ disabled: true });
    // Playwright refuses to click a label of a disabled control; dispatch the click directly.
    label(s).click();
    expect(s.checked).toBe(false);
    expect(s.host.classList.contains('aui-switch--disabled')).toBe(true);
  });
});

describe('Switch: validity and form control contract', () => {
  it('is always valid unless a custom error is set; toggling clears it', async () => {
    const s = mount();
    expect(s.reportValidity()).toBe(true);
    s.setCustomError('Could not save the setting.');
    expect(s.validity).toMatchObject({ valid: false, error: 'custom' });
    expect(errorText(s)).toBe('Could not save the setting.');
    expect(s.input.getAttribute('aria-invalid')).toBe('true');
    await userEvent.click(s.input);
    expect(s.validity.valid).toBe(true);
    expect(s.input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('honours validationTiming from global configuration', () => {
    configureAbsoluteUI({ components: { switch: { validationTiming: 'submit' } } });
    const s = mount();
    s.setCustomError('Could not save the setting.');
    expect(s.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
    s.update({ validationTiming: 'input' });
    s.reportValidity();
    expect(errorText(s)).toBe('Could not save the setting.');
  });

  it('serializes value when on and null when off; supports reset/dirty/touched', async () => {
    const s = mount({ name: 'wifi' });
    expect(getFormControl(s.host)).toBe(s);
    expect(s.getFormValue()).toBeNull();
    await userEvent.click(s.input);
    await userEvent.tab();
    expect(s.getFormValue()).toBe('on');
    expect(s.dirty).toBe(true);
    expect(s.touched).toBe(true);
    s.reset();
    expect(s.checked).toBe(false);
    expect(s.dirty).toBe(false);
    expect(s.touched).toBe(false);
  });

  it('destroy removes rendering, registration, and subscriptions', () => {
    const s = mount();
    const host = s.host;
    s.destroy();
    expect(host.childElementCount).toBe(0);
    expect(getFormControl(host)).toBeUndefined();
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});
