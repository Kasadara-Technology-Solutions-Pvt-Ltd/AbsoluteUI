// Live preview (SPEC section 10.3): a same-origin iframe as wide as the preview area, in
// light, dark, or high contrast and any density. The matrix view shows every
// mode x density, each rendered at their available width without shrinking text.
import { Select } from '@absoluteui/components/select';
import { Switch } from '@absoluteui/components/switch';
import type { ThemeMode } from '@absoluteui/theme';
import { familyModes, modeThemeName, toCss } from '@absoluteui/theme/designer';
import { modeLabels, type DesignerContext } from './context.js';
import { debounce, detail, el, hasChecked, hasNullableValue, host } from './dom.js';
import { isPreviewableFont, isReadyMessage, type PreviewDensity, type ThemeMessage } from './protocol.js';

const densityLabels: Readonly<Record<PreviewDensity, string>> = { comfortable: 'Comfortable', compact: 'Compact', spacious: 'Spacious' };
const densityList: readonly PreviewDensity[] = ['comfortable', 'compact', 'spacious'];
const isDensity = (v: unknown): v is PreviewDensity => densityList.some((d) => d === v);

interface Frame {
  readonly iframe: HTMLIFrameElement;
  readonly wrap: HTMLElement;
  mode: ThemeMode;
  density: PreviewDensity;
  ready: boolean;
}

export function previewPanel(parent: HTMLElement, ctx: DesignerContext): void {
  const controls = el('div', { className: 'td-preview__controls', attrs: { role: 'group', 'aria-label': 'Preview options' } });
  parent.append(controls);
  let density: PreviewDensity = 'comfortable';
  let matrix = false;
  const dens = Select.create(host(controls), { label: 'Density', options: densityList.map((d) => ({ value: d, label: densityLabels[d] })), value: density });
  const mx = Switch.create(host(controls), { label: 'All modes and densities' });
  const stage = el('div', { className: 'td-preview__stage' });
  parent.append(stage);

  let frames: Frame[] = [];
  let css = '';
  const post = (f: Frame): void => {
    if (!f.ready || !f.iframe.contentWindow) return;
    const fonts = ctx.store.family.fonts.map((x) => x.stylesheet).filter(isPreviewableFont);
    const message: ThemeMessage = { type: 'aui-designer-theme', css, theme: modeThemeName(ctx.store.family.name, f.mode), density: f.density, fonts };
    f.iframe.contentWindow.postMessage(message, location.origin);
  };
  const postAll = (): void => {
    css = toCss(ctx.store.family);
    for (const f of frames) post(f);
  };

  const layout = (): void => {
    const width = Math.max(1, stage.clientWidth);
    // Never scale text below the studio's 14px readability floor.
    const columns = matrix ? Math.max(1, Math.min(3, Math.floor((width + 16) / 376))) : 1;
    const frameWidth = Math.max(1, (width - (columns - 1) * 16) / columns);
    stage.style.setProperty('grid-template-columns', `repeat(${String(columns)}, minmax(0, 1fr))`);
    const height = matrix ? 720 : 1400;
    for (const f of frames) {
      f.iframe.style.setProperty('inline-size', `${String(frameWidth)}px`);
      f.iframe.style.setProperty('block-size', `${String(height)}px`);
      f.iframe.style.setProperty('transform', 'none');
      f.wrap.style.setProperty('inline-size', `${String(frameWidth)}px`);
      f.wrap.style.setProperty('block-size', `${String(height)}px`);
    }
  };

  const build = (): void => {
    stage.replaceChildren();
    stage.classList.toggle('td-preview__stage--matrix', matrix);
    const combos: { mode: ThemeMode; density: PreviewDensity }[] = matrix ? familyModes.flatMap((mode) => densityList.map((d) => ({ mode, density: d }))) : [{ mode: ctx.mode(), density }];
    frames = combos.map(({ mode, density: d }) => {
      const label = `${modeLabels[mode]}, ${densityLabels[d]}`;
      const iframe = el('iframe', { className: 'td-preview__frame', attrs: { src: 'frame.html', title: `Theme preview: ${label}`, loading: 'lazy' } });
      const wrap = el('div', { className: 'td-preview__wrap' }, iframe);
      const figure = el('figure', { className: 'td-preview__figure' }, wrap);
      if (matrix) figure.prepend(el('figcaption', { className: 'td-preview__caption', text: label }));
      stage.append(figure);
      return { iframe, wrap, mode, density: d, ready: false };
    });
    layout();
  };

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || !isReadyMessage(event.data)) return;
    const f = frames.find((x) => x.iframe.contentWindow === event.source);
    if (!f) return;
    f.ready = true;
    if (!css) css = toCss(ctx.store.family);
    post(f);
  });

  dens.host.addEventListener('aui-change', (e) => {
    const v = detail(e, hasNullableValue)?.value;
    if (isDensity(v)) {
      density = v;
      for (const f of frames) if (!matrix) f.density = v;
      for (const f of frames) post(f);
    }
  });
  mx.host.addEventListener('aui-change', (e) => {
    matrix = detail(e, hasChecked)?.checked ?? false;
    build();
  });
  ctx.onModeChange((mode) => {
    if (matrix) return;
    for (const f of frames) f.mode = mode;
    for (const f of frames) post(f);
  });
  ctx.store.subscribe(debounce(postAll, 120));
  new ResizeObserver(layout).observe(stage);
  build();
}
