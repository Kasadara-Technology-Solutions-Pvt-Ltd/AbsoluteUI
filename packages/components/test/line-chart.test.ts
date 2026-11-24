import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, fieldsToEpoch, instant, resetAbsoluteUIConfig } from '@absoluteui/core';
import { LineChart, type LineChartOptions, type LineChartSeriesToggleDetail } from '@absoluteui/components/line-chart';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(width = 600): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', `${String(width)}px`);
  document.body.append(el);
  return el;
}

const base: LineChartOptions = {
  label: 'Revenue and costs',
  x: ['Jan', 'Feb', 'Mar', 'Apr'],
  series: [
    { id: 'rev', label: 'Revenue', values: [100, 120, 90, 150] },
    { id: 'cost', label: 'Costs', values: [80, 70, 95, 60] },
  ],
};

function marks(chart: LineChart): SVGElement[] {
  return [...chart.element.querySelectorAll<SVGElement>('.aui-chart__mark')];
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resolve();
    });
  }));
}

describe('LineChart: structure and accessibility', () => {
  it('names the plot by the title, describes it with a generated summary, and labels every point', () => {
    const chart = LineChart.create(host(), base);
    const svg = chart.element;
    expect(svg.getAttribute('role')).toBe('group');
    expect(svg.getAttribute('aria-roledescription')).toBe('line chart');
    expect(document.getElementById(svg.getAttribute('aria-labelledby')!)!.textContent).toBe('Revenue and costs');
    const summary = document.getElementById(svg.getAttribute('aria-describedby')!)!;
    expect(summary.textContent).toBe(chart.summary);
    expect(chart.summary).toContain('line chart, 2 series, 4 data points.');
    expect(chart.summary).toContain('Revenue: minimum 90 at Mar, maximum 150 at Apr, trending up from 100 to 150.');
    expect(chart.summary).toContain('Costs: minimum 60 at Apr, maximum 95 at Mar, trending down from 80 to 60.');
    const m = marks(chart);
    expect(m).toHaveLength(8);
    expect(m.every((el) => el.getAttribute('role') === 'img')).toBe(true);
    expect(m[0]!.getAttribute('aria-label')).toBe('Jan, Revenue: 100');
    expect(m[5]!.getAttribute('aria-label')).toBe('Feb, Costs: 70');
    // Roving focus: exactly one mark in the tab sequence.
    expect(m.filter((el) => el.getAttribute('tabindex') === '0')).toHaveLength(1);
    // Axes and lines are decorative for assistive technology.
    for (const g of chart.element.querySelectorAll('.aui-chart__grid, .aui-chart__axis, .aui-line-chart__series')) expect(g.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses a custom summary and a visible description, and hides the title visually on request', () => {
    const chart = LineChart.create(host(), { ...base, summary: 'Custom summary.', description: 'Fiscal year 2026', hideLabel: true });
    const ids = chart.element.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)!.textContent)).toEqual(['Fiscal year 2026', 'Custom summary.']);
    expect(chart.host.querySelector('.aui-chart__title')!.classList.contains('aui-chart__title--hidden')).toBe(true);
  });

  it('distinguishes series without color: marker shapes and dash classes differ per series', () => {
    const chart = LineChart.create(host(), base);
    const [a, b] = [...chart.element.querySelectorAll('.aui-line-chart__line')];
    expect(a!.getAttribute('class')).toContain('aui-chart__dash--1');
    expect(b!.getAttribute('class')).toContain('aui-chart__dash--2');
    const first = marks(chart)[0]!.getAttribute('d')!;
    const second = marks(chart)[4]!.getAttribute('d')!;
    expect(first).toContain('A');
    expect(second).not.toContain('A');
    // Plain colors by default; textures are opt-in (and always on in forced colors).
    expect(chart.host.classList.contains('aui-chart--patterns')).toBe(false);
    chart.update({ patterns: true });
    expect(chart.host.classList.contains('aui-chart--patterns')).toBe(true);
  });
});

describe('LineChart: keyboard and tooltip', () => {
  it('arrows move through points and series; Home/End/PageDown jump; the tooltip follows focus', async () => {
    const chart = LineChart.create(host(), base);
    // Tab order: the two legend buttons, then the plot (one tab stop).
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    const m = marks(chart);
    expect(document.activeElement).toBe(m[0]);
    const tip = chart.host.querySelector<HTMLElement>('.aui-chart__tooltip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('JanRevenue100');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(m[1]);
    expect(m[1]!.getAttribute('tabindex')).toBe('0');
    expect(m[0]!.hasAttribute('tabindex')).toBe(false);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Feb, Costs: 70');
    await userEvent.keyboard('{End}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Apr, Costs: 60');
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Apr, Revenue: 150');
    await userEvent.keyboard('{Home}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Jan, Revenue: 100');
    await userEvent.keyboard('{PageDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Apr, Revenue: 150');
    expect(tip.textContent).toBe('AprRevenue150');
    // Escape dismisses the tooltip without moving focus (WCAG 1.4.13).
    await userEvent.keyboard('{Escape}');
    expect(tip.hidden).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Apr, Revenue: 150');
    // Tab leaves the plot: one tab stop only.
    await userEvent.tab();
    expect(chart.element.contains(document.activeElement)).toBe(false);
  });

  it('mirrors Left and Right in RTL (the x axis runs right to left)', async () => {
    const chart = LineChart.create(host(), { ...base, direction: 'rtl', legend: 'hide' });
    const m = marks(chart);
    expect(Number(m[0]!.getAttribute('d')!.split(/[MA ]/)[1])).toBeGreaterThan(Number(m[3]!.getAttribute('d')!.split(/[MA ]/)[1]));
    await userEvent.tab();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(m[1]);
  });

  it('dense series use two alternating proxy marks instead of a node per point', async () => {
    const x = Array.from({ length: 700 }, (_, i) => i);
    const chart = LineChart.create(host(), { label: 'Dense', x, series: [{ id: 'a', label: 'A', values: x.map((i) => i * 2) }] });
    const all = () => [...chart.element.querySelectorAll<SVGElement>('.aui-chart__mark')];
    expect(all()).toHaveLength(2);
    await userEvent.tab();
    const first = document.activeElement;
    expect(first?.getAttribute('aria-label')).toBe('0, A: 0');
    await userEvent.keyboard('{ArrowRight}');
    const second = document.activeElement;
    // Focus moves to the other proxy, so screen readers announce the new point.
    expect(second).not.toBe(first);
    expect(second?.getAttribute('aria-label')).toBe('1, A: 2');
    expect(first?.getAttribute('display')).toBe('none');
    await userEvent.keyboard('{End}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('699, A: 1,398');
    expect(chart.host.querySelector('.aui-chart__tooltip')!.textContent).toBe('699A1,398');
    chart.update({ series: [{ id: 'a', label: 'A', values: x.map((i) => i) }] });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('699, A: 699');
    expect(all().filter((el) => el.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('skips gaps while navigating', async () => {
    const chart = LineChart.create(host(), { ...base, series: [{ id: 'a', label: 'A', values: [1, null, Number.NaN, 4] }] });
    expect(marks(chart)).toHaveLength(2);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Apr, A: 4');
  });

  it('shows a shared tooltip for all series on hover and hides it on leave', async () => {
    const chart = LineChart.create(host(), base);
    await userEvent.hover(marks(chart)[2]!);
    const tip = chart.host.querySelector<HTMLElement>('.aui-chart__tooltip')!;
    expect(tip.hidden).toBe(false);
    expect([...tip.querySelectorAll('.aui-chart__tooltip-row')].map((r) => r.textContent)).toEqual(['Revenue90', 'Costs95']);
    expect(marks(chart)[6]!.classList.contains('aui-chart__mark--hover')).toBe(true);
    await userEvent.unhover(chart.element);
    await userEvent.hover(document.body, { position: { x: 1, y: 1 } });
    expect(tip.hidden).toBe(true);
  });

  it('tooltip: false disables it for hover and focus', async () => {
    const chart = LineChart.create(host(), { ...base, tooltip: false, legend: 'hide' });
    await userEvent.tab();
    expect(document.activeElement?.getAttribute('role')).toBe('img');
    expect(chart.host.querySelector<HTMLElement>('.aui-chart__tooltip')!.hidden).toBe(true);
  });

  it('keeps focus on the same data point when options change (regression)', async () => {
    const chart = LineChart.create(host(), { ...base, legend: 'hide' });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    chart.update({ series: [{ id: 'rev', label: 'Revenue', values: [1, 2, 3, 4] }, base.series[1]!] });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Mar, Revenue: 3');
  });
});

describe('LineChart: legend', () => {
  it('toggles series with aria-pressed, emits aui-series-toggle, and keeps focus on the button (regression)', async () => {
    const chart = LineChart.create(host(), base);
    const events: LineChartSeriesToggleDetail[] = [];
    chart.host.addEventListener('aui-series-toggle', (e) => events.push((e as CustomEvent<LineChartSeriesToggleDetail>).detail));
    const legend = chart.host.querySelector('.aui-chart__legend')!;
    expect(legend.getAttribute('aria-label')).toBe('Legend');
    const buttons = () => [...legend.querySelectorAll('button')];
    expect(buttons().map((b) => b.textContent)).toEqual(['Revenue', 'Costs']);
    expect(buttons().every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true);
    await userEvent.click(buttons()[1]!);
    expect(events).toEqual([{ id: 'cost', visible: false, hidden: ['cost'] }]);
    expect(buttons()[1]!.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(buttons()[1]);
    expect(marks(chart)).toHaveLength(4);
    expect(chart.hiddenSeries).toEqual(['cost']);
    expect(chart.summary).toContain('Hidden: Costs.');
    await userEvent.keyboard('{Enter}');
    expect(events[1]).toEqual({ id: 'cost', visible: true, hidden: [] });
    expect(marks(chart)).toHaveLength(8);
  });

  it('shows an explicit empty state when every series is hidden', () => {
    const chart = LineChart.create(host(), { ...base, hiddenSeries: ['rev', 'cost'] });
    expect(marks(chart)).toHaveLength(0);
    const empty = chart.host.querySelector<HTMLElement>('.aui-chart__empty')!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('All series are hidden');
  });

  it('legend auto: hidden for a single series; show forces it', () => {
    const one = { ...base, series: [base.series[0]!] };
    expect(LineChart.create(host(), one).host.querySelector<HTMLElement>('.aui-chart__legend')!.hidden).toBe(true);
    expect(LineChart.create(host(), { ...one, legend: 'show' }).host.querySelector<HTMLElement>('.aui-chart__legend')!.hidden).toBe(false);
  });
});

describe('LineChart: data table fallback', () => {
  it('toggle mode builds the table on demand with exact values and "No value" for gaps', async () => {
    const chart = LineChart.create(host(), { ...base, series: [{ id: 'a', label: 'A', values: [1.5, null, 3, 4] }], xAxis: { label: 'Month' } });
    const toggle = chart.host.querySelector<HTMLButtonElement>('.aui-chart__table-toggle')!;
    expect(toggle.textContent).toBe('Show data table');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(chart.host.querySelector('table')).toBeNull();
    await userEvent.click(toggle);
    const again = chart.host.querySelector<HTMLButtonElement>('.aui-chart__table-toggle')!;
    expect(again.getAttribute('aria-expanded')).toBe('true');
    expect(again.textContent).toBe('Hide data table');
    expect(document.activeElement).toBe(again);
    const table = chart.host.querySelector('table')!;
    expect(document.getElementById(again.getAttribute('aria-controls')!)!.contains(table)).toBe(true);
    expect(table.caption!.textContent).toBe('Revenue and costs');
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Month', 'A']);
    expect([...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent))).toEqual([['Jan', '1.5'], ['Feb', 'No value'], ['Mar', '3'], ['Apr', '4']]);
    expect(table.querySelector('tbody th')!.getAttribute('scope')).toBe('row');
  });

  it('hidden mode renders a visually hidden table; none renders nothing', () => {
    const hidden = LineChart.create(host(), { ...base, dataTable: 'hidden' });
    expect(hidden.host.querySelector('.aui-chart__data')!.classList.contains('aui-chart__data--hidden')).toBe(true);
    expect(hidden.host.querySelectorAll('tbody tr')).toHaveLength(4);
    const none = LineChart.create(host(), { ...base, dataTable: 'none' });
    expect(none.host.querySelector<HTMLElement>('.aui-chart__data')!.hidden).toBe(true);
    expect(none.host.querySelector('table, .aui-chart__table-toggle')).toBeNull();
    const visible = LineChart.create(host(), { ...base, dataTable: 'visible' });
    expect(visible.host.querySelector('.aui-chart__table-scroll')!.getAttribute('role')).toBe('region');
  });
});

describe('LineChart: data handling', () => {
  it('time axis: formats x values in the configured timezone and ticks at local midnight', () => {
    configureAbsoluteUI({ timezone: 'Asia/Kolkata' });
    const x = [0, 1, 2, 3].map((d) => instant(fieldsToEpoch(2026, 3, 1 + d, 18, 30)));
    const chart = LineChart.create(host(), { label: 'Daily', x, series: [{ id: 'a', label: 'A', values: [1, 2, 3, 4] }] });
    // 18:30 UTC is midnight in Kolkata: the day after the UTC date.
    expect(marks(chart)[0]!.getAttribute('aria-label')).toBe('Mar 2, 2026, A: 1');
    const ticks = [...chart.element.querySelectorAll('.aui-chart__axis--category text')].map((t) => t.textContent);
    expect(ticks[0]).toBe('Mar 2');
    chart.update({ timezone: 'UTC' });
    expect(marks(chart)[0]!.getAttribute('aria-label')).toBe('Mar 1, 2026, 6:30 PM, A: 1');
  });

  it('numeric x axis and locale formatting', () => {
    const chart = LineChart.create(host(), { label: 'Load', x: [0.5, 1, 1.5], series: [{ id: 'a', label: 'A', values: [1234.5, 2000, 3000] }], locale: 'de-DE' });
    expect(marks(chart)[0]!.getAttribute('aria-label')).toBe('0,5, A: 1.234,5');
  });

  it('gaps split the line into segments; isolated points keep a visible marker', () => {
    const chart = LineChart.create(host(), { ...base, x: ['a', 'b', 'c', 'd', 'e'], series: [{ id: 's', label: 'S', values: [1, 2, null, 4, null] }] });
    const d = chart.element.querySelector('.aui-line-chart__line')!.getAttribute('d')!;
    expect(d.match(/M/g)).toHaveLength(2);
    expect(chart.element.querySelectorAll('.aui-line-chart__point--isolated')).toHaveLength(1);
    expect(chart.summary).toContain('2 missing values.');
  });

  it('a single point renders centered and isolated', () => {
    const chart = LineChart.create(host(), { label: 'One', x: ['Only'], series: [{ id: 's', label: 'S', values: [7] }] });
    expect(marks(chart)).toHaveLength(1);
    expect(chart.summary).toContain('S: 7 at Only.');
  });

  it('negative values: domain crosses zero and a zero line is drawn; area fills to zero', () => {
    const chart = LineChart.create(host(), { ...base, area: true, series: [{ id: 's', label: 'S', values: [-40, 20, -10, 35] }] });
    expect(chart.element.querySelector('.aui-chart__zero-line')).not.toBeNull();
    expect(chart.element.querySelector('.aui-line-chart__area')).not.toBeNull();
    expect(chart.element.getAttribute('aria-roledescription')).toBe('area chart');
  });

  it('empty data renders the "No data" state', () => {
    const chart = LineChart.create(host(), { label: 'Nothing', x: [], series: [] });
    expect(chart.host.querySelector('.aui-chart__empty')!.textContent).toBe('No data');
    expect(chart.summary).toBe('line chart, 0 series, 0 data points.');
    const nulls = LineChart.create(host(), { label: 'Nulls', x: ['a'], series: [{ id: 's', label: 'S', values: [null] }] });
    expect(nulls.host.querySelector('.aui-chart__empty')!.textContent).toBe('No data');
  });

  it('truncates very long category labels on the axis but keeps them in point labels', () => {
    const long = 'An extremely long category label that cannot fit under a single point';
    const chart = LineChart.create(host(320), { label: 'Long', x: [long, `${long} 2`, `${long} 3`], series: [{ id: 's', label: 'S', values: [1, 2, 3] }] });
    const texts = [...chart.element.querySelectorAll('.aui-chart__axis--category text')].map((t) => t.textContent);
    expect(texts.every((t) => t.length < long.length)).toBe(true);
    expect(marks(chart)[0]!.getAttribute('aria-label')).toBe(`${long}, S: 1`);
  });

  it('re-renders for the new width when the container resizes', async () => {
    const el = host(600);
    const chart = LineChart.create(el, base);
    const before = marks(chart)[3]!.getAttribute('d');
    el.style.setProperty('width', '300px');
    await nextFrame();
    await nextFrame();
    expect(chart.element.getAttribute('width')).toBe('300');
    expect(marks(chart)[3]!.getAttribute('d')).not.toBe(before);
  });

  it('never uses style attributes for colors (CSP): series colors are classes', () => {
    const chart = LineChart.create(host(), base);
    expect(chart.element.querySelector('[style]')).toBeNull();
    expect(chart.element.querySelector('.aui-chart__series--c1')).not.toBeNull();
    expect(chart.element.querySelector('.aui-chart__series--c2')).not.toBeNull();
  });
});

describe('LineChart: validation and lifecycle', () => {
  it.each([
    [{ ...base, label: '' }, 'lineChart.label'],
    [{ ...base, series: [{ id: 'a', label: 'A', values: [1, 2] }] }, 'lineChart.series[0].values'],
    [{ ...base, series: [{ id: 'a', label: 'A', values: [1, 2, 3, 4] }, { id: 'a', label: 'B', values: [1, 2, 3, 4] }] }, 'lineChart.series[1].id'],
    [{ label: 'x', x: [3, 1, 2], series: [] }, 'lineChart.x'],
    [{ ...base, yAxis: { min: 5, max: 1 } }, 'lineChart.yAxis.max'],
    [{ ...base, height: 50 }, 'lineChart.height'],
  ] as [LineChartOptions, string][])('rejects invalid options (%#) and leaves the host untouched', (options, property) => {
    const el = host();
    el.textContent = 'original';
    let error: unknown;
    try {
      LineChart.create(el, options);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AbsoluteUIError);
    expect((error as AbsoluteUIError).details.property).toBe(property);
    expect(el.textContent).toBe('original');
  });

  it('a failed update keeps the previous state', () => {
    const chart = LineChart.create(host(), base);
    expect(() => {
      chart.update({ x: ['a'] });
    }).toThrow(AbsoluteUIError);
    expect(marks(chart)).toHaveLength(8);
  });

  it('global configuration applies to existing instances', () => {
    const chart = LineChart.create(host(), base);
    configureAbsoluteUI({ components: { lineChart: { dataTable: 'none', height: 200 } } });
    expect(chart.host.querySelector('.aui-chart__table-toggle')).toBeNull();
    expect(chart.element.getAttribute('height')).toBe('200');
  });

  it('destroy removes rendering, classes, and listeners', () => {
    const el = host();
    const chart = LineChart.create(el, base);
    chart.destroy();
    expect(el.childNodes).toHaveLength(0);
    expect(el.className).toBe('');
    expect(el.getAttribute('style')).toBe('width: 600px;');
  });
});

describe('LineChart: zoom, pan, and crosshair (R3)', () => {
  const long: LineChartOptions = {
    label: 'Daily',
    x: Array.from({ length: 20 }, (_, i) => i),
    series: [{ id: 's', label: 'S', values: Array.from({ length: 20 }, (_, i) => i * 2) }],
  };

  it('zoomRange limits the marks to the window; the toolbar offers zoom controls', () => {
    const chart = LineChart.create(host(), { ...long, zoom: true, zoomRange: { from: 5, to: 9 } });
    expect(marks(chart).map((m) => m.getAttribute('aria-label'))).toEqual(['5, S: 10', '6, S: 12', '7, S: 14', '8, S: 16', '9, S: 18']);
    const tools = [...chart.host.querySelectorAll('.aui-chart__tool')].map((b) => b.getAttribute('aria-label'));
    expect(tools).toEqual(['Zoom in', 'Zoom out', 'Reset zoom']);
    // The line reaches past the window and is clipped to the plot.
    expect(chart.element.querySelector('.aui-line-chart__series')?.getAttribute('clip-path')).toMatch(/^url\(#aui-chart-clip/);
  });

  it('arrow keys past the window edge pan it; = zooms in, 0 resets; events report the range', async () => {
    const chart = LineChart.create(host(), { ...long, zoom: true, zoomRange: { from: 0, to: 4 } });
    const events: { from: number; to: number } [] = [];
    chart.host.addEventListener('aui-zoom', (e) => {
      const d = (e as CustomEvent<{ x: { from: number; to: number } | null }>).detail;
      if (d.x) events.push(d.x);
    });
    marks(chart)[0]!.focus();
    await userEvent.keyboard('{End}{ArrowRight}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('5, S: 10');
    expect(chart.zoomRange).toEqual({ from: 1, to: 5 });
    expect(events.at(-1)).toEqual({ from: 1, to: 5 });
    await userEvent.keyboard('0');
    expect(chart.zoomRange).toBeNull();
    expect(marks(chart)).toHaveLength(20);
    await userEvent.keyboard('=');
    expect(chart.zoomRange).not.toBeNull();
  });

  it('Reset zoom is aria-disabled until zoomed; buttons zoom around the center', async () => {
    const chart = LineChart.create(host(), { ...long, zoom: true });
    const [zoomIn, , reset] = [...chart.host.querySelectorAll<HTMLButtonElement>('.aui-chart__tool')];
    expect(reset!.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(zoomIn!);
    const r = chart.zoomRange!;
    expect((r.from + r.to) / 2).toBeCloseTo(9.5, 5);
    expect(reset!.hasAttribute('aria-disabled')).toBe(false);
    await userEvent.click(reset!);
    expect(chart.zoomRange).toBeNull();
  });

  it('crosshair follows keyboard focus and hides when focus leaves', async () => {
    const chart = LineChart.create(host(), { ...base, crosshair: true });
    marks(chart)[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    const line = chart.element.querySelector('.aui-chart__crosshair');
    expect(line?.getAttribute('display')).toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(chart.element.querySelector('.aui-chart__crosshair')?.getAttribute('display')).toBe('none');
  });

  it('rejects an invalid zoom range', () => {
    expect(() => LineChart.create(host(), { ...long, zoomRange: { from: 1, to: Number.NaN } })).toThrow(AbsoluteUIError);
  });
});
