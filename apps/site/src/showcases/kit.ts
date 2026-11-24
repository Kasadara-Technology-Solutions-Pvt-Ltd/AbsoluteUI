// Showcase kit: the frame layout every showcase shares. A heading, an optional
// "Simulated server" note, a bar of option controls that change the showcased
// components live, the stage, and an event log. Every control is an
// AbsoluteUI component; theme, density, direction, and locale come from the docs toolbar
// through runtime.ts.
//
// Focus mode: sections and parts declare the components they demonstrate
// (`data-components`). With `?focus=<component>` in the URL, and at least one part declaring
// it, only those parts stay visible (the others get the `hidden` attribute), a note links
// the full showcase, and option controls marked for other components are hidden too.
import { Button } from '@absoluteui/components/button';
import { Select } from '@absoluteui/components/select';
import { Switch } from '@absoluteui/components/switch';
import type { ChartTheme } from '@absoluteui/components/line-chart';

export interface Showcase {
  readonly root: HTMLElement;
  /** Bar of option controls. */
  readonly controls: HTMLElement;
  /** Where the showcased components live. */
  readonly stage: HTMLElement;
  /** Appends an entry to the event log. */
  log(event: string, detail?: unknown): void;
  /** Logs every listed event dispatched on `target` with its detail. */
  listen(target: EventTarget, events: readonly string[], source: string): void;
}

export interface ShowcaseOptions {
  readonly title: string;
  readonly description?: string;
  /** Shows the "Simulated server" note: data and saves are answered in the browser. */
  readonly simulated?: boolean;
}

const MAX_LOG = 40;

/** Event details as short text: DOM nodes and functions are named, long values are cut. */
export function describe(detail: unknown): string {
  if (detail === undefined || detail === null) return '';
  let text: string;
  try {
    text = JSON.stringify(detail, (_key, value: unknown) => {
      if (value instanceof Node) return `<${value.nodeName.toLowerCase()}>`;
      if (typeof value === 'function') return 'function';
      if (value instanceof File) return `File(${value.name})`;
      return value;
    });
  } catch {
    text = typeof detail === 'string' ? detail : Object.prototype.toString.call(detail);
  }
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

export function createShowcase(options: ShowcaseOptions): Showcase {
  const doc = document;
  const root = doc.createElement('div');
  root.className = 'sc';
  const heading = doc.createElement('h1');
  heading.className = 'sc__title';
  heading.textContent = options.title;
  root.append(heading);
  if (options.description) {
    const p = doc.createElement('p');
    p.className = 'sc__description';
    p.textContent = options.description;
    root.append(p);
  }
  if (options.simulated === true) {
    const note = doc.createElement('p');
    note.className = 'sc__simulated';
    note.textContent = 'Simulated server: data and saves are answered inside this page, with realistic delays.';
    root.append(note);
  }
  const controls = doc.createElement('div');
  controls.className = 'sc__controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Showcase options');
  const stage = doc.createElement('div');
  stage.className = 'sc__stage';

  const logSection = doc.createElement('section');
  logSection.className = 'sc__log';
  logSection.setAttribute('aria-labelledby', 'sc-log-title');
  const logHead = doc.createElement('div');
  logHead.className = 'sc__log-head';
  const logTitle = doc.createElement('h2');
  logTitle.id = 'sc-log-title';
  logTitle.textContent = 'Event log';
  const list = doc.createElement('ol');
  list.className = 'sc__log-list';
  // The list scrolls once it fills up: keyboard users reach it like any scroll region (WCAG 2.1.1).
  list.tabIndex = 0;
  list.setAttribute('aria-labelledby', 'sc-log-title');
  const clear = Button.create({ text: 'Clear', variant: 'ghost', size: 'sm' }, doc);
  clear.element.addEventListener('click', () => {
    list.replaceChildren();
  });
  logHead.append(logTitle, clear.element);
  logSection.append(logHead, list);

  root.append(controls, stage, logSection);
  doc.body.append(root);

  // Sections are created synchronously by the showcase module; the microtask runs after it.
  const focus = focusParam();
  if (focus !== null) {
    queueMicrotask(() => {
      applyFocus(root, controls, stage, focus, options.title);
    });
  }

  const log = (event: string, detail?: unknown): void => {
    const item = doc.createElement('li');
    const name = doc.createElement('code');
    name.textContent = event;
    item.append(name);
    const text = describe(detail);
    if (text !== '') item.append(` ${text}`);
    list.prepend(item);
    while (list.children.length > MAX_LOG) list.lastElementChild?.remove();
  };
  return {
    root,
    controls,
    stage,
    log,
    listen(target, events, source) {
      for (const type of events) {
        target.addEventListener(type, (e) => {
          log(`${source} ${type}`, e instanceof CustomEvent ? e.detail : undefined);
        });
      }
    },
  };
}

/** Component names: lower-case words joined by hyphens. */
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** The `focus` query parameter when it is a well-formed component name. */
function focusParam(): string | null {
  const value = new URLSearchParams(location.search).get('focus');
  return value !== null && NAME.test(value) ? value : null;
}

const declared = (el: Element): readonly string[] => (el.getAttribute('data-components') ?? '').split(' ').filter((n) => n !== '');

/** Display names of the showcased components, from the page's `aui-component-names` meta (JSON object). */
function displayName(name: string): string {
  const content = document.querySelector('meta[name="aui-component-names"]')?.getAttribute('content');
  if (content) {
    try {
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null) {
        const value: unknown = (parsed as Record<string, unknown>)[name];
        if (typeof value === 'string' && value !== '') return value;
      }
    } catch {
      // Malformed meta: fall back to the name.
    }
  }
  const words = name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function applyFocus(root: HTMLElement, controls: HTMLElement, stage: HTMLElement, focus: string, title: string): void {
  const parts = [...stage.querySelectorAll<HTMLElement>('[data-components]')];
  const matches = (el: Element): boolean => declared(el).includes(focus);
  // Unknown here (or not annotated): the full showcase.
  if (!parts.some(matches)) return;
  for (const part of parts) {
    let shown = matches(part) || [...part.querySelectorAll('[data-components]')].some(matches);
    for (let up = part.parentElement?.closest('[data-components]'); !shown && up && stage.contains(up); up = up.parentElement?.closest('[data-components]')) {
      shown = matches(up);
    }
    part.hidden = !shown;
  }
  for (const control of controls.querySelectorAll<HTMLElement>(':scope > [data-components]')) control.hidden = !matches(control);
  controls.hidden = [...controls.children].every((c) => c instanceof HTMLElement && c.hidden);
  root.classList.add('sc--focus');
  root.dataset.focus = focus;

  const note = document.createElement('p');
  note.className = 'sc__focus';
  note.append(`Part of the ${title} showcase that uses ${displayName(focus)}.`);
  const full = new URL(location.href);
  full.searchParams.delete('focus');
  const link = document.createElement('a');
  link.href = full.pathname + full.search;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Open the full showcase';
  note.append(' ', link);
  root.insertBefore(note, controls);
}

/** Records the components an element demonstrates (focus mode keeps it when it lists the focused one). */
export function annotate<T extends HTMLElement>(el: T, components: readonly string[]): T {
  el.setAttribute('data-components', components.join(' '));
  return el;
}

function controlHost(sc: Showcase, components?: readonly string[]): HTMLDivElement {
  const host = document.createElement('div');
  host.className = 'sc__control';
  if (components) annotate(host, components);
  sc.controls.append(host);
  return host;
}

/** A switch in the option bar; `components` limits it to those components' focus views. */
export function toggle(sc: Showcase, label: string, initial: boolean, onChange: (checked: boolean) => void, components?: readonly string[]): Switch {
  const host = controlHost(sc, components);
  const control = Switch.create(host, { label, checked: initial });
  host.addEventListener('aui-change', (e) => {
    onChange((e as CustomEvent<{ checked: boolean }>).detail.checked);
  });
  return control;
}

/** A select in the option bar; `components` limits it to those components' focus views. */
export function choice<T extends string>(sc: Showcase, label: string, values: readonly { readonly value: T; readonly label: string }[], initial: T, onChange: (value: T) => void, components?: readonly string[]): Select {
  const host = controlHost(sc, components);
  const control = Select.create(host, { label, options: values, value: initial });
  host.addEventListener('aui-change', (e) => {
    const value = (e as CustomEvent<{ value: string | null }>).detail.value;
    const match = values.find((v) => v.value === value);
    if (match) onChange(match.value);
  });
  return control;
}

/** A button in the option bar; `components` limits it to those components' focus views. */
export function action(sc: Showcase, label: string, onClick: () => void, components?: readonly string[]): Button {
  const button = Button.create({ text: label, variant: 'secondary', size: 'sm' }, document);
  button.element.classList.add('sc__action');
  if (components) annotate(button.element, components);
  button.element.addEventListener('click', onClick);
  sc.controls.append(button.element);
  return button;
}

/** A labelled block inside the stage; `components` lists the components it demonstrates (focus mode). */
export function section(sc: Showcase, title: string, components?: readonly string[]): HTMLElement {
  const s = document.createElement('section');
  s.className = 'sc__section';
  if (components) annotate(s, components);
  const h = document.createElement('h2');
  h.textContent = title;
  s.append(h);
  sc.stage.append(s);
  return s;
}

/** An empty element appended to `parent` (component hosts). */
export function hostIn(parent: HTMLElement, tag: keyof HTMLElementTagNameMap = 'div'): HTMLElement {
  const el = document.createElement(tag);
  parent.append(el);
  return el;
}

/** Simulated server latency: resolves after `ms`, rejects with an AbortError when `signal` aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** A small text block (summaries, outputs) that updates politely for screen readers. */
export function status(parent: HTMLElement): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'sc-status';
  p.setAttribute('role', 'status');
  parent.append(p);
  return p;
}

/** Anything with the shared chart options (every AbsoluteUI chart). */
export interface ChartLike {
  update(options: { legend?: 'auto' | 'show' | 'hide'; dataTable?: 'toggle' | 'visible' | 'hidden' | 'none'; patterns?: boolean }): void;
}

/** Charts with the shared look-and-feel option: every chart, Sparkline and Gauge included. */
export interface ThemedChart {
  update(options: { theme?: ChartTheme | undefined }): void;
}

type Look = 'default' | 'vivid' | 'rounded' | 'minimal';

/** Three looks; palettes keep 3:1 against light and dark surfaces. */
const LOOKS: Readonly<Record<Look, ChartTheme | undefined>> = {
  default: undefined,
  vivid: { palette: ['#8b5cf6', '#ec4899', '#0891b2', '#ea580c'], lineWidth: 3, markerSize: 5, barRadius: 6, gradient: true, gridDash: '4 3', areaOpacity: 0.25, legendPosition: 'bottom' },
  // One overall corner radius (bars, cells, tiles, slices, arcs, boxes, swatches, tooltip, controls) and round joins.
  rounded: { cornerRadius: 8, swatchRadius: 8, lineJoin: 'round', lineWidth: 2.5, legendPosition: 'bottom' },
  minimal: { palette: ['#64748b', '#0d9488', '#a16207', '#8b5cf6'], gridLines: false, lineWidth: 1.5, barRadius: 2, fontSize: 13, legendPosition: 'end' },
};

/** A "Style" choice (theme default, vivid, minimal) and an opt-in "Animate" switch for `charts`. */
export function chartLook(sc: Showcase, charts: readonly ThemedChart[], components?: readonly string[]): void {
  let look: Look = 'default';
  let animate = false;
  const apply = (): void => {
    const base = LOOKS[look];
    const theme: ChartTheme | undefined = animate ? { ...base, animation: { duration: 450 } } : base;
    for (const c of charts) c.update({ theme });
  };
  choice(
    sc,
    'Style',
    [
      { value: 'default', label: 'Theme default' },
      { value: 'vivid', label: 'Vivid (gradients, rounded bars)' },
      { value: 'rounded', label: 'Rounded (corner radius 8 on every chart element)' },
      { value: 'minimal', label: 'Minimal (no grid, legend at the end)' },
    ],
    look,
    (value) => {
      look = value;
      apply();
    },
    components,
  );
  toggle(
    sc,
    'Animate (respects reduced motion)',
    false,
    (on) => {
      animate = on;
      apply();
    },
    components,
  );
}

/** Option-bar controls every chart supports: legend, data table, and patterns (WCAG 1.4.1). */
export function chartControls(sc: Showcase, charts: readonly ChartLike[], components?: readonly string[]): void {
  choice(
    sc,
    'Legend',
    [
      { value: 'auto', label: 'Automatic' },
      { value: 'show', label: 'Always' },
      { value: 'hide', label: 'Hidden' },
    ],
    'auto',
    (legend) => {
      for (const c of charts) c.update({ legend });
    },
    components,
  );
  choice(
    sc,
    'Data table',
    [
      { value: 'toggle', label: 'Behind a button' },
      { value: 'visible', label: 'Always visible' },
      { value: 'none', label: 'None' },
    ],
    'toggle',
    (dataTable) => {
      for (const c of charts) c.update({ dataTable });
    },
    components,
  );
  toggle(
    sc,
    'Patterns',
    false,
    (patterns) => {
      for (const c of charts) c.update({ patterns });
    },
    components,
  );
}
