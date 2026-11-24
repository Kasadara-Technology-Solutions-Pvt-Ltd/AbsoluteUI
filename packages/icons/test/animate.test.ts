import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError } from '@absoluteui/core';
import { animateIcon, getIconAnimation, renderIcon, setIconMotionPolicy, type VectorIcon } from '@absoluteui/icons';

const loader: VectorIcon<'outline' | 'duotone', 'base' | 'accent'> = {
  kind: 'vector',
  id: 'test-loader',
  viewBox: '0 0 24 24',
  animations: [{ preset: 'spin', trigger: 'loading' }, { preset: 'bounce', trigger: 'loading', target: 'accent' }, { preset: 'wiggle', trigger: 'hover' }, { preset: 'draw', trigger: 'success', target: 'accent' }],
  variants: {
    outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['path', { d: 'M12 3a9 9 0 1 1-9 9' }]] }],
    duotone: [
      { name: 'base', role: 'primary', paint: 'stroke', nodes: [['path', { d: 'M4 20h16' }]] },
      { name: 'accent', role: 'accent', paint: 'stroke', nodes: [['path', { d: 'M12 4v12' }]] },
    ],
  },
};

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return error instanceof AbsoluteUIError ? error.code : 'other';
  }
  return 'none';
};
const attached = (el: Element): Element => {
  document.body.append(el);
  return el;
};

afterEach(() => {
  setIconMotionPolicy('system');
  document.body.replaceChildren();
});

describe('icon animation (R16-14)', () => {
  it('is static until a trigger fires, and only presets the icon lists can run', () => {
    const icon = attached(renderIcon(loader));
    expect(icon.querySelector('[data-aui-motion]')).toBeNull();
    expect(code(() => animateIcon(icon, { preset: 'shake' }))).toBe('ICON_INVALID_OPTION');
    expect(code(() => animateIcon(renderIcon('check'), { preset: 'spin' }))).toBe('ICON_INVALID_OPTION');
    expect(code(() => animateIcon(icon, { preset: 'spin', durationMs: 50 }))).toBe('ICON_INVALID_OPTION');
    expect(code(() => animateIcon(icon, { preset: 'wiggle' }))).toBe('ICON_INVALID_OPTION'); // hover needs a host
  });

  it('runs spin as CSS while loading and stops at idle', () => {
    const icon = attached(renderIcon(loader, { label: 'Loading' }));
    const motion = animateIcon(icon, { preset: 'spin' });
    expect(getIconAnimation(icon)).toBe(motion);
    const wrapper = icon.querySelector('[data-aui-motion="spin"]');
    expect(wrapper?.hasAttribute('data-aui-motion-wrapper')).toBe(true);
    motion.setState('loading');
    expect(motion.state).toBe('running');
    expect(wrapper?.getAttribute('data-aui-motion-state')).toBe('running');
    motion.setState('idle');
    expect(motion.state).toBe('idle');
    expect(wrapper?.hasAttribute('data-aui-motion-state')).toBe(false);
  });

  it('keeps the static state when motion is reduced by the application policy', () => {
    setIconMotionPolicy('reduce');
    const icon = attached(renderIcon(loader));
    const motion = animateIcon(icon, { preset: 'spin' });
    motion.setState('loading');
    expect(motion.state).toBe('idle');
    expect(
      code(() => {
        setIconMotionPolicy('fast' as never);
      }),
    ).toBe('ICON_INVALID_OPTION');
  });

  it('animates a named layer with the Web Animations API', () => {
    const icon = attached(renderIcon(loader, { variant: 'duotone' }));
    const motion = animateIcon(icon, { preset: 'bounce' });
    motion.setState('loading');
    const accent = icon.querySelector('g[data-layer="accent"]');
    expect(accent?.getAnimations().length).toBe(1);
    expect(code(() => animateIcon(renderIcon(loader), { preset: 'bounce' }))).toBe('ICON_INVALID_OPTION'); // accent is not drawn in outline
    motion.stop();
    expect(accent?.getAnimations().length).toBe(0);
  });

  it('draws strokes with the measured length', () => {
    const icon = attached(renderIcon(loader, { variant: 'duotone' }));
    const motion = animateIcon(icon, { preset: 'draw' });
    motion.setState('success');
    const [animation] = icon.querySelector('g[data-layer="accent"]')?.getAnimations() ?? [];
    const frames = animation?.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [];
    expect(frames[0]?.strokeDashoffset).toBe('12');
    motion.dispose();
  });

  it('plays on host events and removes its listeners and markup on dispose', () => {
    const host = document.createElement('button');
    const icon = renderIcon(loader);
    host.append(icon);
    attached(host);
    const motion = animateIcon(icon, { preset: 'wiggle', host });
    host.dispatchEvent(new PointerEvent('pointerenter'));
    expect(motion.state).toBe('running');
    motion.dispose();
    expect(icon.querySelector('[data-aui-motion-wrapper]')).toBeNull();
    expect(icon.querySelector('path')?.parentElement?.getAttribute('data-layer')).toBe('base');
    host.dispatchEvent(new PointerEvent('pointerenter'));
    expect(icon.getAnimations({ subtree: true }).length).toBe(0);
    expect(getIconAnimation(icon)).toBeUndefined();
  });

  it('morphs a curated pair forward and back, fading paths without a partner', () => {
    const menu: VectorIcon<'outline', 'base'> = {
      kind: 'vector',
      id: 'test-menu',
      viewBox: '0 0 24 24',
      animations: [{ preset: 'morph', trigger: 'on-change' }],
      morph: { to: 'close', layer: 'base', paths: ['M6 6L18 18', null, 'M6 18L18 6'] },
      variants: { outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['path', { d: 'M4 6L20 6' }], ['path', { d: 'M4 12L20 12' }], ['path', { d: 'M4 18L20 18' }]] }] },
    };
    const icon = attached(renderIcon(menu));
    const motion = animateIcon(icon, { preset: 'morph' });
    motion.play();
    const paths = [...icon.querySelectorAll('path')];
    expect(paths.map((p) => p.getAttribute('d'))).toEqual(['M6 6L18 18', 'M4 12L20 12', 'M6 18L18 6']);
    expect(paths[1]?.style.opacity).toBe('0');
    motion.play();
    expect(paths.map((p) => p.getAttribute('d'))).toEqual(['M4 6L20 6', 'M4 12L20 12', 'M4 18L20 18']);
    motion.play();
    motion.dispose();
    expect(paths[0]?.getAttribute('d')).toBe('M4 6L20 6');
    const broken: VectorIcon<'outline', 'base'> = { ...menu, id: 'test-menu-broken', morph: { to: 'close', layer: 'base', paths: ['M6 6L18 18'] } };
    expect(code(() => renderIcon(broken))).toBe('ICON_INVALID');
  });

  it('starts a loading animation set before the icon is inserted', () => {
    const icon = renderIcon(loader, { variant: 'duotone' });
    const motion = animateIcon(icon, { preset: 'bounce' });
    motion.setState('loading');
    attached(icon);
    expect(icon.getAnimations({ subtree: true }).length).toBe(1);
    motion.dispose();
  });

  it('stops repeating once the icon leaves the document', async () => {
    const icon = attached(renderIcon(loader, { variant: 'duotone' }));
    const motion = animateIcon(icon, { preset: 'bounce', durationMs: 100 });
    motion.setState('loading');
    icon.remove();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(icon.getAnimations({ subtree: true }).length).toBe(0);
    expect(motion.state).toBe('idle');
  });
});
