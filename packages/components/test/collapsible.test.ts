import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Collapsible, collapsibleConfig, type CollapsibleChangeDetail, type CollapsibleOptions } from '@absoluteui/components/collapsible';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<CollapsibleOptions> = {}): Collapsible {
  const host = document.createElement('div');
  document.body.append(host);
  return Collapsible.create(host, { label: 'Advanced settings', content: 'Proxy and cache options.', ...options });
}

describe('Collapsible', () => {
  it('renders a disclosure button that controls a hidden region', () => {
    const c = mount();
    const trigger = c.trigger;
    expect(trigger.localName).toBe('button');
    expect(trigger.type).toBe('button');
    expect(trigger.textContent).toBe('Advanced settings');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;
    expect(panel.hidden).toBe(true);
    expect(c.content.textContent).toBe('Proxy and cache options.');
    expect(c.open).toBe(false);
    expect(c.host.classList).toContain('aui-collapsible--plain');
  });

  it('toggles on click and emits aui-change; programmatic changes do not emit', () => {
    const c = mount();
    const onChange = vi.fn();
    c.host.addEventListener('aui-change', (e) => {
      onChange((e as CustomEvent<CollapsibleChangeDetail>).detail);
    });
    c.trigger.click();
    expect(c.open).toBe(true);
    expect(c.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(c.host.classList).toContain('aui-collapsible--open');
    expect(onChange).toHaveBeenLastCalledWith({ open: true });
    c.hide();
    c.show();
    c.toggle();
    c.update({ open: true });
    expect(c.open).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stays closed and focusable when disabled', () => {
    const c = mount({ disabled: true });
    c.trigger.click();
    expect(c.open).toBe(false);
    expect(c.trigger.getAttribute('aria-disabled')).toBe('true');
    expect(c.trigger.disabled).toBe(false);
  });

  it('wraps the trigger in a heading and changes or removes it on update', () => {
    const c = mount({ headingLevel: 3, open: true });
    expect(c.host.firstElementChild!.localName).toBe('h3');
    expect(c.host.querySelector('h3 > button')).toBe(c.trigger);
    c.update({ headingLevel: 4 });
    expect(c.host.querySelector('h3')).toBeNull();
    expect(c.host.querySelector('h4 > button')).toBe(c.trigger);
    c.update({ headingLevel: null });
    expect(c.host.firstElementChild).toBe(c.trigger);
    expect(c.open).toBe(true);
  });

  it('takes Node content without parsing strings as HTML; replaces content on update', () => {
    const list = document.createElement('ul');
    list.append(document.createElement('li'));
    const c = mount({ content: '<b>x</b>' });
    expect(c.content.querySelector('b')).toBeNull();
    c.update({ content: list });
    expect(c.content.firstChild).toBe(list);
  });

  it('follows the configured variant', () => {
    const c = mount();
    configureAbsoluteUI({ components: { collapsible: { variant: 'bordered' } } });
    expect(c.host.classList).toContain('aui-collapsible--bordered');
    expect([...collapsibleConfig.optionNames]).toEqual(['variant']);
  });

  it('validates options before touching the host, and on update', () => {
    const host = document.createElement('div');
    const bad: unknown[] = [{ label: '', content: 'x' }, { label: 'x' }, { label: 'x', content: 42 }, { label: 'x', content: 'y', headingLevel: 1 }, { label: 'x', content: 'y', open: 'yes' }, { label: 'x', content: 'y', icons: { expand: 'nope' } }];
    for (const options of bad) expect(() => Collapsible.create(host, options as CollapsibleOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
    const c = mount();
    expect(() => {
      c.update({ icons: { expand: 'nope' } });
    }).toThrow(AbsoluteUIError);
    expect(c.trigger.querySelector('svg')).not.toBeNull();
  });

  it('destroy removes rendering, classes, listeners, and subscriptions', () => {
    const c = mount({ variant: 'bordered' });
    const trigger = c.trigger;
    c.destroy();
    expect(c.host.childNodes.length).toBe(0);
    expect(c.host.className).toBe('');
    trigger.click();
    expect(c.open).toBe(false);
    configureAbsoluteUI({ components: { collapsible: { variant: 'plain' } } });
    expect(c.host.className).toBe('');
  });
});
