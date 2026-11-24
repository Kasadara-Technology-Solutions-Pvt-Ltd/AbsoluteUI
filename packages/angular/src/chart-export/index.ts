/**
 * Chart export for AbsoluteUI Angular charts: pass the chart component, for example
 * `downloadChart(chart, { format: 'svg', fileName: 'tickets' })` with `#chart="auiBarChart"`.
 * Every function returns null (or resolves without effect) before the chart has rendered,
 * which includes server rendering. Works with every chart component (`aui-bar-chart`, `aui-line-chart`, ...).
 */
import { chartToPng as toPng, chartToSvg as toSvg, downloadChart as download, type ChartDownloadOptions, type ChartExportOptions, type ExportableChart } from '@absoluteui/components/chart-export';
import { controllerOf, type ComponentBridge, type Controller } from '../internal/bridge.js';

export type { ChartDownloadOptions, ChartExportFormat, ChartExportOptions } from '@absoluteui/components/chart-export';

/** Standalone SVG markup of the chart (computed paint and text styles inlined). */
export function chartToSvg<C extends ExportableChart & Controller<O>, O>(chart: ComponentBridge<C, O>, options?: ChartExportOptions): string | null {
  const c = controllerOf(chart)();
  return c ? toSvg(c, options) : null;
}

/** PNG image of the chart. */
export async function chartToPng<C extends ExportableChart & Controller<O>, O>(chart: ComponentBridge<C, O>, options?: ChartExportOptions): Promise<Blob | null> {
  const c = controllerOf(chart)();
  return c ? toPng(c, options) : null;
}

/** Download the chart as SVG or PNG. */
export async function downloadChart<C extends ExportableChart & Controller<O>, O>(chart: ComponentBridge<C, O>, options: ChartDownloadOptions): Promise<void> {
  const c = controllerOf(chart)();
  if (c) await download(c, options);
}
