import { expect, test } from '@playwright/test';

/**
 * Assert a performance budget and record the measured value for the published
 * performance page (R4 phase A). `label` names the measurement within the test.
 */
export function withinBudget(value: number, budget: number, label: string): void {
  test.info().annotations.push({ type: 'perf', description: JSON.stringify({ label, value, budget }) });
  expect(value, label).toBeLessThan(budget);
}
