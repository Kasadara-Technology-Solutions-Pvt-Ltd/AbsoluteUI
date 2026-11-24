/**
 * Opt-in icon animation (R16-14, docs/icons/layering-animation-draft.md section 3): curated presets per
 * icon, state and host triggers, reduced motion by default, deterministic cleanup. `spin` and
 * `pulse` run as CSS keyframes from the theme base layer (so a server-rendered loading icon turns
 * before scripts run); the other presets use the Web Animations API with bounded iterations.
 */
import { configurationError } from '@absoluteui/core';
import { SVG_NS } from './nodes.js';
import { vectorStateOf, type IconAnimationPreset, type IconAnimationTrigger, type IconLayerName, type VectorAnimation } from './vector.js';

export type IconAnimationState = 'idle' | 'loading' | 'success' | 'error';
/** `'system'` follows `prefers-reduced-motion`; `'reduce'` never animates; `'allow-essential'` also runs animations marked essential when the user prefers reduced motion. */
export type IconMotionPolicy = 'system' | 'reduce' | 'allow-essential';

export interface IconAnimationOptions<L extends IconLayerName = IconLayerName> {
  /** A preset the icon lists in its definition. */
  readonly preset: IconAnimationPreset;
  /** Default: the trigger the icon lists for the preset. */
  readonly trigger?: IconAnimationTrigger;
  /** Default: the layer the icon lists for the preset, else the whole icon. */
  readonly target?: L;
  /** 100 to 3000. */
  readonly durationMs?: number;
  /** 0 to 2000. */
  readonly delayMs?: number;
  /** `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, or `cubic-bezier(a, b, c, d)`. */
  readonly easing?: string;
  /** 1 to 10. While a `loading` state lasts, the animation repeats in bounded rounds. */
  readonly iterations?: number;
  readonly direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  /** Delay between layers for `reveal` and `fade`, 0 to 300. */
  readonly staggerMs?: number;
  /** Element whose hover, focus, or press triggers the animation (`hover`, `focus`, `press` triggers). */
  readonly host?: Element;
  /** Runs even when the user prefers reduced motion, if the application set the `'allow-essential'` policy. */
  readonly essential?: boolean;
}

export interface IconAnimationController {
  /** `'running'` while motion plays. */
  readonly state: 'idle' | 'running';
  play(): void;
  /** Stop and show the static end state. */
  stop(): void;
  restart(): void;
  /** State-driven triggers: `loading`, `success`, `error` play; `idle` stops. */
  setState(state: IconAnimationState): void;
  /** Cancel animations and remove listeners and attributes. */
  dispose(): void;
}

const CSS_PRESETS: ReadonlySet<IconAnimationPreset> = new Set(['spin', 'pulse']);
const EASING_RE = /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\))$/;
const DEFAULT_MS: Readonly<Record<IconAnimationPreset, number>> = { spin: 900, pulse: 1200, bounce: 700, wiggle: 600, shake: 450, draw: 600, reveal: 900, fade: 400, morph: 300 };
let policy: IconMotionPolicy = 'system';
const controllers = new WeakMap<Element, IconAnimationController>();

const bad = (property: string, expected: string): never => {
  throw configurationError('ICON_INVALID_OPTION', 'Invalid icon option.', { property: `animation.${property}`, expected });
};

/** Application-level motion policy (never per instance from untrusted input). */
export function setIconMotionPolicy(next: IconMotionPolicy): void {
  if (!(['system', 'reduce', 'allow-essential'] as const).some((p) => p === (next as unknown))) bad('policy', '"system", "reduce", or "allow-essential"');
  policy = next;
}

function reduced(doc: Document, essential: boolean): boolean {
  if (policy === 'reduce') return true;
  const prefers = doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
  return prefers && !(policy === 'allow-essential' && essential);
}

const isSvg = (el: Element | null | undefined): el is SVGGraphicsElement => el?.namespaceURI === SVG_NS;

/** The animation controller `animateIcon` attached to an icon. */
export function getIconAnimation(icon: Element): IconAnimationController | undefined {
  return controllers.get(icon);
}

/**
 * Animate a vector icon with one of the presets its definition lists. Static until a trigger fires.
 * @example
 * import { renderIcon, animateIcon, type VectorIcon } from '@absoluteui/icons';
 * const spinner: VectorIcon<'outline', 'base'> = { kind: 'vector', id: 'demo-spinner', viewBox: '0 0 24 24', animations: [{ preset: 'spin', trigger: 'loading' }], variants: { outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['path', { d: 'M12 3a9 9 0 1 1-9 9' }]] }] } };
 * const icon = renderIcon(spinner, { label: 'Loading' });
 * const motion = animateIcon(icon, { preset: 'spin' });
 * motion.setState('loading');
 * motion.state; // => 'running'
 * motion.dispose();
 */
export function animateIcon<L extends IconLayerName>(icon: Element, options: IconAnimationOptions<L>): IconAnimationController {
  const vector = vectorStateOf(icon);
  if (!vector) return bad('icon', 'an AbsoluteUI vector icon from renderIcon');
  const listed: VectorAnimation | undefined = vector.def.animations?.find((a) => a.preset === options.preset);
  if (!listed) return bad('preset', `a preset ${vector.def.id} lists: ${(vector.def.animations ?? []).map((a) => a.preset).join(', ') || 'none'}`);
  const trigger = options.trigger ?? listed.trigger;
  const targetName = options.target ?? listed.target;
  const duration = options.durationMs ?? DEFAULT_MS[options.preset];
  if (!(Number.isFinite(duration) && duration >= 100 && duration <= 3000)) bad('durationMs', '100 to 3000');
  const delay = options.delayMs ?? 0;
  if (!(Number.isFinite(delay) && delay >= 0 && delay <= 2000)) bad('delayMs', '0 to 2000');
  const easing = options.easing ?? 'ease-in-out';
  if (!EASING_RE.test(easing)) bad('easing', 'a CSS easing keyword or cubic-bezier()');
  const iterations = options.iterations ?? 1;
  if (!(Number.isInteger(iterations) && iterations >= 1 && iterations <= 10)) bad('iterations', '1 to 10');
  const stagger = options.staggerMs ?? 120;
  if (!(Number.isFinite(stagger) && stagger >= 0 && stagger <= 300)) bad('staggerMs', '0 to 300');
  if ((trigger === 'hover' || trigger === 'focus' || trigger === 'press') && !options.host) bad('host', `an element for the ${trigger} trigger`);

  getIconAnimation(icon)?.dispose();
  const doc = icon.ownerDocument;
  // The moving element: a named layer of the icon itself, or a wrapper around the whole drawing.
  let target: SVGGraphicsElement | undefined;
  let wrapper: SVGGElement | undefined;
  if (targetName !== undefined) {
    target = [...icon.querySelectorAll(`g[data-layer="${targetName}"]`)].find((g): g is SVGGraphicsElement => isSvg(g) && g.closest('[data-overlay]') === null);
    if (!target) return bad('target', `a layer of the rendered variant (${targetName} is not drawn)`);
  } else {
    wrapper = doc.createElementNS(SVG_NS, 'g');
    wrapper.setAttribute('data-aui-motion-wrapper', '');
    wrapper.append(...[...icon.childNodes].filter((n) => !(n instanceof Element && n.localName === 'defs')));
    icon.append(wrapper);
    target = wrapper;
  }
  const moving = target;
  if (listed.origin) {
    moving.style.setProperty('transform-box', 'view-box');
    moving.style.setProperty('transform-origin', `${String(listed.origin[0])}px ${String(listed.origin[1])}px`);
  } else {
    moving.style.setProperty('transform-box', 'fill-box');
    moving.style.setProperty('transform-origin', options.preset === 'wiggle' ? 'center top' : 'center');
  }
  if (CSS_PRESETS.has(options.preset)) {
    moving.setAttribute('data-aui-motion', options.preset);
    moving.style.setProperty('--aui-icon-motion-duration', `${String(duration)}ms`);
    if (options.essential) moving.setAttribute('data-aui-motion-essential', '');
  }

  const running: Animation[] = [];
  let state: 'idle' | 'running' = 'idle';
  let current: IconAnimationState = 'idle';
  let disposed = false;
  const removers: (() => void)[] = [];

  const keyframes = (el: SVGGraphicsElement): Keyframe[] => {
    switch (options.preset) {
      case 'bounce':
        return [{ transform: 'translate(0, 0)' }, { transform: 'translate(0, 2px)' }, { transform: 'translate(0, 0)' }];
      case 'wiggle':
        return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0deg)' }];
      case 'shake':
        return [{ transform: 'translate(0, 0)' }, { transform: 'translate(-1.5px, 0)' }, { transform: 'translate(1.5px, 0)' }, { transform: 'translate(-1.5px, 0)' }, { transform: 'translate(0, 0)' }];
      case 'draw': {
        const length = Math.max(...[...el.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect')].map((s) => (s instanceof SVGGeometryElement ? s.getTotalLength() : 0)), 1);
        return [{ strokeDasharray: String(length), strokeDashoffset: String(length) }, { strokeDasharray: String(length), strokeDashoffset: '0' }];
      }
      default:
        return [{ opacity: 0 }, { opacity: 1 }];
    }
  };

  // Morph: the layer's paths move to the definition's targets; each play toggles between the two icons.
  const morph = options.preset === 'morph' ? vector.def.morph : undefined;
  const morphPaths = morph ? [...icon.querySelectorAll(`g[data-layer="${morph.layer}"] path`)].filter((path): path is SVGPathElement => path instanceof SVGPathElement && path.closest('[data-overlay]') === null) : [];
  const originals = morphPaths.map((path) => path.getAttribute('d') ?? '');
  let morphed = false;
  const canMorphPaths = typeof CSS !== 'undefined' && CSS.supports('d', 'path("M0 0")');
  const settle = (to: boolean): void => {
    morphPaths.forEach((path, k) => {
      const target = morph?.paths[k];
      path.setAttribute('d', to && target ? target : (originals[k] ?? ''));
      path.style.setProperty('opacity', to && target === null ? '0' : '1');
    });
    morphed = to;
  };
  const playMorph = (): void => {
    const to = !morphed;
    if (reduced(doc, options.essential === true) || !canMorphPaths) {
      settle(to);
      return;
    }
    state = 'running';
    const started = morphPaths.map((path, k) => {
      const target = morph?.paths[k] ?? null;
      const a = originals[k] ?? '';
      const frames: Keyframe[] = target === null ? [{ opacity: 1 }, { opacity: 0 }] : [{ d: `path("${a}")` }, { d: `path("${target}")` }];
      return path.animate(to ? frames : [...frames].reverse(), { duration, delay, easing, fill: 'none' });
    });
    running.push(...started);
    const last = started[started.length - 1];
    settle(to);
    if (last) last.finished.then(() => {
      if (running.every((r) => r.playState === 'finished')) state = 'idle';
    }, () => undefined);
  };

  const finish = (): void => {
    for (const a of running.splice(0)) a.cancel();
    if (CSS_PRESETS.has(options.preset)) moving.removeAttribute('data-aui-motion-state');
    state = 'idle';
  };

  const play = (): void => {
    if (disposed) return;
    finish();
    if (morph) {
      playMorph();
      return;
    }
    if (reduced(doc, options.essential === true)) return; // static end state
    state = 'running';
    if (CSS_PRESETS.has(options.preset)) {
      moving.setAttribute('data-aui-motion-state', 'running');
      return;
    }
    // Reveal staggers the icon's own layers (not the container or overlays); other presets move the target.
    const parts = options.preset === 'reveal' ? [...moving.querySelectorAll('g[data-layer]')].filter((g): g is SVGGraphicsElement => isSvg(g) && g.getAttribute('data-layer') !== 'container' && g.closest('[data-overlay]') === null) : [];
    // The first round plays even before the icon is inserted; repeats need it in the document.
    const round = (): void => {
      if (disposed) return;
      const started = (parts.length > 1 ? parts : [moving]).map((el, k) =>
        el.animate(keyframes(el), { duration, delay: delay + k * stagger, easing, iterations, direction: options.direction ?? 'normal', fill: 'none' }),
      );
      running.push(...started);
      const last = started[started.length - 1];
      if (!last) return;
      last.finished.then(() => {
        // Loading repeats in bounded rounds while the state lasts and the icon is in the document.
        if (!disposed && current === 'loading' && trigger === 'loading' && icon.isConnected) {
          running.splice(0);
          round();
        } else if (running.every((a) => a.playState === 'finished')) {
          state = 'idle';
        }
      }, () => undefined);
    };
    round();
  };

  const controller: IconAnimationController = {
    get state() {
      return state;
    },
    play,
    stop: finish,
    restart: () => {
      finish();
      play();
    },
    setState: (next) => {
      if (!['idle', 'loading', 'success', 'error'].includes(next)) bad('state', '"idle", "loading", "success", or "error"');
      current = next;
      if (next === 'idle') finish();
      else if (next === trigger || trigger === 'manual' || trigger === 'on-change') play();
    },
    dispose: () => {
      if (disposed) return;
      finish();
      disposed = true;
      for (const remove of removers.splice(0)) remove();
      for (const name of ['data-aui-motion', 'data-aui-motion-state', 'data-aui-motion-essential']) moving.removeAttribute(name);
      for (const name of ['transform-box', 'transform-origin', '--aui-icon-motion-duration']) moving.style.removeProperty(name);
      if (morph) settle(false);
      if (wrapper) {
        wrapper.replaceWith(...wrapper.childNodes);
      }
      controllers.delete(icon);
    },
  };

  const listen = (type: string, handler: (event: Event) => void): void => {
    const host = options.host;
    if (!host) return;
    host.addEventListener(type, handler);
    removers.push(() => {
      host.removeEventListener(type, handler);
    });
  };
  if (trigger === 'hover') listen('pointerenter', play);
  if (trigger === 'focus') listen('focusin', play);
  if (trigger === 'press') {
    listen('pointerdown', play);
    listen('keydown', (event) => {
      if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) play();
    });
  }
  if (trigger === 'idle') play();
  controllers.set(icon, controller);
  return controller;
}
