// Charts section (R20-15): the `chart` component tokens shared by every chart (palette slots,
// grid, axis, text, value labels, tooltip, line width, fonts), with a live chart preview that
// follows the mode being edited. Values resolve exactly as in a theme: an override, else the
// global fallback token of the edited mode. Corner rounding (R20-22): the optional chart tokens
// (chart-corner-radius, per-element radii, chart-line-join) are unset by default, so every
// element keeps its built-in look until a value is entered.
import { BarChart } from '@absoluteui/components/bar-chart';
import { LineChart } from '@absoluteui/components/line-chart';
import { PieChart } from '@absoluteui/components/pie-chart';
import { chartOptionalTokenNames, componentTokens, getComponentToken, optionalTokenProblem, optionalTokens } from '@absoluteui/theme';
import { resolveToken } from '@absoluteui/theme/designer';
import type { DesignerContext } from './context.js';
import { el, host } from './dom.js';
import { withComponentToken, withToken } from './store.js';
import { tokenRow, type TokenRow } from './token-row.js';

/** Global tokens the preview surface needs besides the chart tokens (surface, text, borders). */
const SURFACE_TOKENS = ['color-surface', 'color-text', 'color-text-muted', 'color-border', 'color-border-strong', 'color-focus-ring', 'color-hover', 'font-family-sans', 'shadow-md', 'radius-md', 'radius-sm'];

export function chartsPanel(parent: HTMLElement, ctx: DesignerContext): { reveal(name: string): boolean } {
  parent.append(el('p', { className: 'td-hint', text: 'Chart tokens apply to all 20 chart types. Leave a field empty to follow the global token. The preview below follows the mode selected at the top.' }));
  const group = componentTokens.chart;
  const names = Object.keys(group?.tokens ?? {}).map((p) => `chart-${p}`);

  // Live preview: token values are written on the preview container through the CSSOM.
  const preview = el('div', { className: 'td-chart-preview', attrs: { role: 'group', 'aria-label': 'Chart preview' } });
  parent.append(preview);
  const categories = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const line = LineChart.create(host(preview), {
    label: 'Line and area',
    x: categories,
    area: true,
    series: [
      { id: 'a', label: 'Series 1', values: [12, 18, 15, 22, 26, 24] },
      { id: 'b', label: 'Series 2', values: [8, 10, 14, 12, 16, 19] },
      { id: 'c', label: 'Series 3', values: [4, 6, 5, 9, 8, 11] },
    ],
    annotations: [{ type: 'line', axis: 'y', value: 20, label: 'Target', tone: 'info' }],
    height: 220,
    dataTable: 'none',
  });
  const bar = BarChart.create(host(preview), {
    label: 'Palette slots 1-8',
    categories: ['Q1', 'Q2'],
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `s${String(n)}`, label: `Slot ${String(n)}`, values: [n + 3, 12 - n] })),
    valueLabels: true,
    height: 220,
    dataTable: 'none',
  });
  const donut = PieChart.create(host(preview), {
    label: 'Slices',
    donut: true,
    slices: [
      { id: 'a', label: 'Slot 1', value: 45 },
      { id: 'b', label: 'Slot 2', value: 30 },
      { id: 'c', label: 'Slot 3', value: 25 },
    ],
    height: 220,
    dataTable: 'none',
  });

  const paint = (): void => {
    const mode = ctx.store.family.modes[ctx.mode()];
    for (const name of [...SURFACE_TOKENS, ...names]) {
      const value = resolveToken(mode, name);
      if (value === undefined) preview.style.removeProperty(`--aui-${name}`);
      else preview.style.setProperty(`--aui-${name}`, value);
    }
    for (const name of chartOptionalTokenNames) {
      const value = mode.tokens[name];
      if (value === undefined) preview.style.removeProperty(`--aui-${name}`);
      else preview.style.setProperty(`--aui-${name}`, value);
    }
    // The charts measure text and read corner radii when they render: re-render after changes.
    line.update({});
    bar.update({});
    donut.update({});
  };

  const list = host(parent, 'td-group');
  const rows = new Map<string, TokenRow>();
  for (const [property, spec] of Object.entries(group?.tokens ?? {})) {
    const name = `chart-${property}`;
    const row = tokenRow({
      name,
      description: `${spec.usage}. Falls back to ${spec.fallback}.`,
      color: spec.kind === 'color',
      clearable: true,
      placeholder: `${spec.fallback}: ${resolveToken(ctx.store.family.modes[ctx.mode()], spec.fallback) ?? ''}`,
      read: () => ctx.store.family.modes[ctx.mode()].componentTokens[name],
      write: (value) => {
        ctx.store.set(withComponentToken(ctx.store.family, ctx.mode(), name, value), `edit ${name}`);
      },
    });
    rows.set(name, row);
    list.append(row.element);
  }

  // Corner rounding (R20-22): optional theme tokens, unset by default.
  parent.append(el('h3', { className: 'td-subheading', text: 'Corner rounding and line joins' }));
  parent.append(el('p', { className: 'td-hint', text: 'Optional. chart-corner-radius rounds every cornered chart element; the element radii win over it. Leave a field empty to keep the built-in look. The tooltip and control radii are the chart-tooltip-radius and chart-control-radius tokens above.' }));
  const cornerList = host(parent, 'td-group');
  for (const name of chartOptionalTokenNames) {
    const spec = optionalTokens[name];
    const row = tokenRow({
      name,
      description: spec?.usage ?? '',
      color: false,
      clearable: true,
      placeholder: 'unset (built-in)',
      read: () => ctx.store.family.modes[ctx.mode()].tokens[name],
      write: (value) => {
        ctx.store.set(withToken(ctx.store.family, ctx.mode(), name, value), `edit ${name}`);
      },
      check: (v: string) => {
        const problem = optionalTokenProblem(name, v);
        return problem === null ? null : `Use ${problem}.`;
      },
    });
    rows.set(name, row);
    cornerList.append(row.element);
  }

  const refresh = (): void => {
    for (const row of rows.values()) row.refresh();
    paint();
  };
  ctx.store.subscribe(refresh);
  ctx.onModeChange(refresh);
  paint();

  return {
    reveal(name) {
      if (getComponentToken(name)?.component !== 'chart' && !chartOptionalTokenNames.includes(name)) return false;
      const row = rows.get(name);
      row?.element.scrollIntoView({ block: 'center' });
      row?.focus();
      return row !== undefined;
    },
  };
}
