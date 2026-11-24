import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ToggleGroup, toggleGroupConfig, type ToggleGroupChangeDetail, type ToggleGroupOptions } from '@absoluteui/components/toggle-group';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const ALIGN = [
  { value: 'start', label: 'Align start', icon: 'align-start', iconOnly: true },
  { value: 'center', label: 'Align center', icon: 'align-center', iconOnly: true },
  { value: 'end', label: 'Align end', icon: 'align-end', iconOnly: true },
];

function mount(options: Partial<ToggleGroupOptions> = {}): ToggleGroup {
  const host = document.createElement('div');
  document.body.append(host);
  return ToggleGroup.create(host, { label: 'Text alignment', items: ALIGN, ...options });
}

const buttons = (g: ToggleGroup): HTMLButtonElement[] => [...g.host.querySelectorAll('button')];
const pressed = (g: ToggleGroup): (string | null)[] => buttons(g).map((b) => b.getAttribute('aria-pressed'));

describe('ToggleGroup', () => {
  it('is a named group of toggle buttons with one in the tab sequence', () => {
    const g = mount({ value: ['center'] });
    expect(g.host.getAttribute('role')).toBe('group');
    expect(g.host.getAttribute('aria-label')).toBe('Text alignment');
    expect(pressed(g)).toEqual(['false', 'true', 'false']);
    expect(buttons(g).map((b) => b.getAttribute('aria-label'))).toEqual(['Align start', 'Align center', 'Align end']);
    expect(buttons(g).filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(g.value).toEqual(['center']);
  });

  it('single mode: pressing one releases the other; the group emits one aui-change', async () => {
    const g = mount({ value: ['start'] });
    const changes: ToggleGroupChangeDetail[] = [];
    const buttonEvents = vi.fn();
    document.body.addEventListener('aui-change', (e) => {
      if (e.target !== g.host) buttonEvents();
    });
    g.host.addEventListener('aui-change', (e) => {
      changes.push((e as CustomEvent<ToggleGroupChangeDetail>).detail);
    });
    await userEvent.click(buttons(g)[2]!);
    expect(pressed(g)).toEqual(['false', 'false', 'true']);
    expect(changes).toEqual([{ value: ['end'], changed: 'end' }]);
    // Releasing the pressed item leaves none pressed (not required).
    await userEvent.click(buttons(g)[2]!);
    expect(g.value).toEqual([]);
    expect(buttonEvents).not.toHaveBeenCalled();
  });

  it('required single mode keeps one item pressed', async () => {
    const g = mount({ required: true });
    expect(g.value).toEqual(['start']);
    const onChange = vi.fn();
    g.host.addEventListener('aui-change', onChange);
    await userEvent.click(buttons(g)[0]!);
    expect(g.value).toEqual(['start']);
    expect(pressed(g)[0]).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('multiple mode keeps item order and toggles independently', async () => {
    const g = mount({ multiple: true, items: [{ value: 'bold', label: 'Bold' }, { value: 'italic', label: 'Italic' }, { value: 'underline', label: 'Underline' }], value: ['underline'] });
    await userEvent.click(buttons(g)[0]!);
    expect(g.value).toEqual(['bold', 'underline']);
    await userEvent.click(buttons(g)[2]!);
    expect(g.value).toEqual(['bold']);
  });

  it('arrow keys move focus (roving tabindex), skipping disabled items; Space toggles', async () => {
    const g = mount({ items: [ALIGN[0]!, { ...ALIGN[1]!, disabled: true }, ALIGN[2]!] });
    g.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(buttons(g)[2]);
    expect(buttons(g)[2]!.tabIndex).toBe(0);
    await userEvent.keyboard(' ');
    expect(g.value).toEqual(['end']);
  });

  it('setValue and update do not emit; size follows configuration', () => {
    const g = mount();
    const onChange = vi.fn();
    g.host.addEventListener('aui-change', onChange);
    g.setValue(['end']);
    expect(pressed(g)).toEqual(['false', 'false', 'true']);
    configureAbsoluteUI({ components: { toggleGroup: { size: 'sm' } } });
    expect(buttons(g)[0]!.classList).toContain('aui-button--sm');
    g.update({ attached: true, orientation: 'vertical', disabled: true });
    expect(g.host.classList).toContain('aui-toggle-group--attached');
    expect(g.host.getAttribute('aria-orientation')).toBe('vertical');
    expect(buttons(g).every((b) => b.disabled)).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect([...toggleGroupConfig.optionNames]).toEqual(['size']);
  });

  it('validates options before touching the host', () => {
    const host = document.createElement('div');
    const bad: unknown[] = [
      { label: '', items: ALIGN },
      { label: 'x', items: [] },
      { label: 'x', items: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] },
      { label: 'x', items: ALIGN, value: ['nope'] },
      { label: 'x', items: ALIGN, value: ['start', 'end'] },
      { label: 'x', items: [{ value: 'a', label: 'A', icon: 'nope' }] },
    ];
    for (const options of bad) expect(() => ToggleGroup.create(host, options as ToggleGroupOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
  });

  it('destroy removes buttons, attributes, and listeners', () => {
    const g = mount({ value: ['start'] });
    g.destroy();
    expect(g.host.childNodes.length).toBe(0);
    expect(g.host.getAttributeNames().filter((n) => n !== 'class')).toEqual([]);
    expect(g.host.className).toBe('');
  });
});
