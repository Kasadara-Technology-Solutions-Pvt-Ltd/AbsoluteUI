/**
 * Discrete sequential color steps used by Calendar Heatmap (R20 P11): a value
 * domain split into 3-9 steps of one palette slot, each with a fill strength class
 * (`<block>__level--<15..100>`, the slot color mixed into the surface). Internal.
 */
import { validators } from '@absoluteui/core';
import { chartFail, isChartColor, type ChartColor } from './model.js';
import { linearTicks } from './scale.js';

export interface ChartColorSteps {
  /** Palette slot. Default 1. */
  color?: ChartColor;
  /** Scale domain. Default: the data extent (nice-rounded). */
  min?: number;
  max?: number;
  /** Number of discrete steps, 3-9. Default 5. */
  steps?: number;
}

export interface ColorStep {
  readonly from: number;
  readonly to: number;
  readonly slot: number;
  /** Fill strength class suffix (15-100, multiples of 5). */
  readonly level: number;
}

/** Validate a `colorScale` option of shape `ChartColorSteps`. */
export function assertColorSteps(value: unknown, component: string, code: string): void {
  if (value === undefined) return;
  if (!validators.isRecord(value)) chartFail(code, component, 'colorScale', '{ color?, min?, max?, steps? }');
  if (!isChartColor(value.color)) chartFail(code, component, 'colorScale.color', 'integer 1-8');
  for (const key of ['min', 'max'] as const) {
    const v = value[key];
    if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v))) chartFail(code, component, `colorScale.${key}`, 'finite number');
  }
  if (typeof value.min === 'number' && typeof value.max === 'number' && value.max <= value.min) chartFail(code, component, 'colorScale.max', 'number greater than colorScale.min');
  if (value.steps !== undefined && !(typeof value.steps === 'number' && Number.isInteger(value.steps) && value.steps >= 3 && value.steps <= 9)) chartFail(code, component, 'colorScale.steps', 'integer from 3 to 9');
}

/** Steps over [lo, hi] (the data extent unless the scale fixes it). */
export function colorSteps(scale: ChartColorSteps | undefined, lo: number, hi: number): ColorStep[] {
  const count = scale?.steps ?? 5;
  const fixed = scale?.min !== undefined || scale?.max !== undefined;
  const t = linearTicks(scale?.min ?? lo, scale?.max ?? (hi > lo ? hi : lo + 1), count, !fixed);
  const size = (t.max - t.min) / count || 1;
  const steps: ColorStep[] = [];
  for (let k = 1; k <= count; k++) steps.push({ from: t.min + (k - 1) * size, to: t.min + k * size, slot: scale?.color ?? 1, level: Math.max(15, Math.round((100 * k) / count / 5) * 5) });
  return steps;
}

/** The step of a value (values outside the domain use the first or last step). */
export function stepOf(steps: readonly ColorStep[], value: number): ColorStep | undefined {
  return steps.find((s, i) => value < s.to || i === steps.length - 1) ?? steps[0];
}
