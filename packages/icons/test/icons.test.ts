import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError } from '@absoluteui/core';
import { builtInIcons, registerIcons, renderIcon, setIconProvider } from '@absoluteui/icons';

afterEach(() => {
  setIconProvider(null);
});

describe('icon rendering (§7)', () => {
  it('renders every built-in icon as decorative SVG by default', () => {
    for (const name of Object.keys(builtInIcons)) {
      const el = renderIcon(name);
      expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.getAttribute('focusable')).toBe('false');
      expect(el.classList.contains('aui-icon')).toBe(true);
    }
  });

  it('renders semantic icons with role=img and an accessible name (§7.3)', () => {
    const el = renderIcon('alert-circle', { label: 'Error' });
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Error');
    expect(el.hasAttribute('aria-hidden')).toBe(false);
  });

  it('lets a global provider replace built-in icons', () => {
    setIconProvider({ resolve: (name) => (name === 'close' ? { kind: 'class', className: 'corp-icon corp-x' } : undefined) });
    const el = renderIcon('close');
    expect(el.localName).toBe('span');
    expect(el.className).toBe('corp-icon corp-x aui-icon');
    expect(renderIcon('check').localName).toBe('svg');
  });

  it('supports factory definitions for external libraries and templates', () => {
    const el = renderIcon({ kind: 'factory', create: (doc) => doc.createElement('i') });
    expect(el.localName).toBe('i');
  });

  it('registers custom icons with validation', () => {
    registerIcons({ star: { kind: 'svg', viewBox: '0 0 24 24', paths: ['M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z'] } });
    expect(renderIcon('star').getAttribute('fill')).toBe('currentColor');
    expect(() => {
      registerIcons({ bad: { kind: 'svg', viewBox: '0 0 24 24', paths: ['M0 0"/><script>'] } });
    }).toThrow(AbsoluteUIError);
    expect(() => {
      registerIcons({ bad: { kind: 'class', className: 'x" onclick="y' } });
    }).toThrow(AbsoluteUIError);
  });

  it('fails predictably for unknown icons', () => {
    expect(() => renderIcon('does-not-exist')).toThrow(/Unknown icon/);
  });
});
