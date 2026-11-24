import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Button } from '@absoluteui/components/button';
import { ButtonGroup, type ButtonGroupActionDetail, type ButtonGroupOptions } from '@absoluteui/components/button-group';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<ButtonGroupOptions> = {}): ButtonGroup {
  const host = document.createElement('div');
  document.body.append(host);
  return ButtonGroup.create(host, {
    label: 'Text alignment',
    buttons: [{ text: 'Left', value: 'left' }, { text: 'Center', value: 'center' }, { icon: 'menu', label: 'Justify' }],
    ...options,
  });
}

describe('ButtonGroup: semantics', () => {
  it('renders a labelled group of native Buttons', () => {
    const g = mount({ size: 'sm' });
    expect(g.element.getAttribute('role')).toBe('group');
    expect(g.element.getAttribute('aria-label')).toBe('Text alignment');
    expect(g.buttons).toHaveLength(3);
    expect(g.buttons.every((b) => b.type === 'button' && b.classList.contains('aui-button') && b.classList.contains('aui-button--sm'))).toBe(true);
    expect(g.buttons[2]!.getAttribute('aria-label')).toBe('Justify');
    expect(g.element.classList.contains('aui-button-group--horizontal')).toBe(true);
    expect(g.element.classList.contains('aui-button-group--attached')).toBe(true);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => ButtonGroup.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    // Icon-only buttons need a label (Button validation); already created Buttons are discarded.
    expect(() => ButtonGroup.create(host, { label: 'x', buttons: [{ text: 'A' }, { icon: 'menu' }] })).toThrow(/accessible name/);
    // @ts-expect-error invalid orientation
    expect(() => ButtonGroup.create(host, { label: 'x', orientation: 'diagonal' })).toThrow(AbsoluteUIError);
    expect(() => ButtonGroup.enhance(host, { label: 'x', buttons: [] })).toThrow(/create\(\) only/);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('role')).toBe(false);
    expect(host.className).toBe('');
  });

  it('disables individual buttons natively', () => {
    const g = mount({ buttons: [{ text: 'A' }, { text: 'B', disabled: true }] });
    expect(g.buttons[1]!.disabled).toBe(true);
  });
});

describe('ButtonGroup: interaction', () => {
  it('Tab moves through every button (not a roving toolbar)', async () => {
    const g = mount();
    await userEvent.tab();
    expect(document.activeElement).toBe(g.buttons[0]);
    await userEvent.tab();
    expect(document.activeElement).toBe(g.buttons[1]);
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(g.buttons[1]);
  });

  it('emits a bubbling aui-action with the button value on click and keyboard activation', async () => {
    const g = mount();
    const onAction = vi.fn<(d: ButtonGroupActionDetail) => void>();
    document.body.addEventListener('aui-action', (e) => {
      onAction((e as CustomEvent<ButtonGroupActionDetail>).detail);
    });
    await userEvent.click(g.buttons[1]!);
    expect(onAction).toHaveBeenLastCalledWith({ value: 'center' });
    g.buttons[2]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(onAction).toHaveBeenLastCalledWith({ value: '2' });
    expect(onAction).toHaveBeenCalledTimes(2);
  });
});

describe('ButtonGroup: enhance', () => {
  it('enhances plain native buttons, leaves existing Buttons alone, and restores on destroy', async () => {
    const el = document.createElement('div');
    el.setAttribute('aria-label', 'Original');
    const plain = document.createElement('button');
    plain.textContent = 'Plain';
    const own = Button.create({ text: 'Own', variant: 'primary', size: 'lg' });
    el.append(plain, own.element);
    document.body.append(el);
    const g = ButtonGroup.enhance(el, { label: 'Actions', size: 'sm', attached: false });
    expect(plain.classList.contains('aui-button--sm')).toBe(true);
    expect(own.element.classList.contains('aui-button--lg')).toBe(true);
    expect(el.classList.contains('aui-button-group--attached')).toBe(false);
    const onAction = vi.fn();
    el.addEventListener('aui-action', onAction);
    await userEvent.click(plain);
    expect(onAction).not.toHaveBeenCalled();
    g.destroy();
    expect(el.children).toHaveLength(2);
    expect(plain.classList.contains('aui-button')).toBe(false);
    expect(own.element.classList.contains('aui-button')).toBe(true);
    expect(el.getAttribute('aria-label')).toBe('Original');
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.className).toBe('');
  });
});

describe('ButtonGroup: configuration and lifecycle', () => {
  it('global config applies and instance options win', () => {
    configureAbsoluteUI({ components: { buttonGroup: { orientation: 'vertical', attached: false } } });
    const g = mount();
    expect(g.element.classList.contains('aui-button-group--vertical')).toBe(true);
    expect(g.element.classList.contains('aui-button-group--attached')).toBe(false);
    const h = mount({ orientation: 'horizontal', attached: true });
    expect(h.element.classList.contains('aui-button-group--horizontal')).toBe(true);
    configureAbsoluteUI({ components: { buttonGroup: { attached: true } } });
    expect(g.element.classList.contains('aui-button-group--horizontal')).toBe(true);
    expect(g.element.classList.contains('aui-button-group--attached')).toBe(true);
  });

  it('update rebuilds buttons and applies size', () => {
    const g = mount();
    g.update({ size: 'lg' });
    expect(g.buttons.every((b) => b.classList.contains('aui-button--lg'))).toBe(true);
    const first = g.buttons[0];
    g.update({ label: 'Align' });
    expect(g.buttons[0]).toBe(first);
    g.update({ buttons: [{ text: 'Only' }] });
    expect(g.buttons.map((b) => b.textContent)).toEqual(['Only']);
    expect(g.buttons[0]!.classList.contains('aui-button--lg')).toBe(true);
  });

  it('destroy removes created buttons, listeners, and subscriptions', async () => {
    const g = mount();
    const host = g.element;
    const button = g.buttons[0]!;
    g.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('role')).toBe(false);
    expect(button.classList.contains('aui-button')).toBe(false);
    host.append(button);
    const onAction = vi.fn();
    host.addEventListener('aui-action', onAction);
    await userEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
    configureAbsoluteUI({ components: { buttonGroup: { orientation: 'vertical' } } });
    expect(host.className).toBe('');
  });
});
