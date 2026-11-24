import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from 'vitest/browser';
import { ApplicationRef, Component, createComponent, EnvironmentInjector, provideZonelessChangeDetection, signal, type ComponentRef, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import type { ChartSeries } from '@absoluteui/components/line-chart';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiBarChart } from '../src/bar-chart/index.js';
import { AUI_DATA_TABLE } from '../src/data-table/index.js';
import { AuiLineChart } from '../src/line-chart/index.js';
import { AuiPieChart } from '../src/pie-chart/index.js';
import { AuiStatCard } from '../src/stat-card/index.js';
import { AuiTabs } from '../src/tabs/index.js';
import { AuiTextInput } from '../src/text-input/index.js';

// docs/PLAN-R9-ANGULAR.md M6 benchmarks. Budgets are generous upper bounds (machine load varies);
// packages/angular/test/m6-baseline.json records the measured baseline. Each run writes its
// measurements to .cache/angular-bench.json. Retained-object checks use WeakRef after a forced GC
// (Chromium runs with --expose-gc, vitest.angular.config.ts).

const BUDGET = {
  aMount: 1500,
  aPatch: 300,
  bMount: 1500,
  bScroll: 100,
  cMount: 1500,
  loopPerMount: 300,
} as const;

const results: Record<string, number> = {};

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {
    // Already initialized by another test file in the same run.
  }
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US', timezone: 'UTC' })] });
});

afterAll(async () => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  await server.commands.writeFile('.cache/angular-bench.json', `${JSON.stringify({ date: new Date().toISOString(), results }, null, 2)}\n`);
});

/** Mount a component outside TestBed's fixture list (so nothing retains it after destroy). */
async function mount<T>(type: Type<T>): Promise<{ ref: ComponentRef<T>; ms: number }> {
  const appRef = TestBed.inject(ApplicationRef);
  const hostElement = document.createElement('div');
  document.body.append(hostElement);
  const start = performance.now();
  const ref = createComponent(type, { environmentInjector: TestBed.inject(EnvironmentInjector), hostElement });
  appRef.attachView(ref.hostView);
  await appRef.whenStable();
  // Controllers are created after the first render; wait for that render to finish.
  await new Promise((r) => requestAnimationFrame(r));
  await appRef.whenStable();
  return { ref, ms: performance.now() - start };
}

function unmount(ref: ComponentRef<unknown>): void {
  const host: unknown = ref.location.nativeElement;
  ref.destroy();
  if (host instanceof Element) host.remove();
}

function forceGc(): void {
  const gc: unknown = Reflect.get(globalThis, 'gc');
  if (typeof gc !== 'function') throw new Error('gc() unavailable: run Chromium with --js-flags=--expose-gc');
  Reflect.apply(gc, undefined, []);
}

/** One mount and destroy; only weak references leave this function. */
async function mountOnce(type: Type<unknown>): Promise<WeakRef<object>[]> {
  const { ref } = await mount(type);
  const host: unknown = ref.location.nativeElement;
  const refs: WeakRef<object>[] = [new WeakRef(ref.instance as object)];
  if (host instanceof Element) refs.push(new WeakRef(host));
  unmount(ref);
  return refs;
}

/** Mount and destroy `n` times; every component instance and host must be collectable afterwards. */
async function loop(type: Type<unknown>, n: number): Promise<{ perMount: number; retained: number[] }> {
  const refs: WeakRef<object>[] = [];
  const start = performance.now();
  for (let i = 0; i < n; i++) refs.push(...(await mountOnce(type)));
  const perMount = (performance.now() - start) / n;
  // Collect after pending microtasks, timers, and frames of destroyed components have run. A short
  // timer (debounce, announcement) may hold a destroyed component until it fires: that is not a
  // leak, so collect again after short waits and report only what stays reachable.
  const reachable = (): number[] => refs.flatMap((r, i) => (r.deref() === undefined ? [] : [i]));
  let retained: number[] = [];
  for (const wait of [50, 500, 1500]) {
    await new Promise((r) => setTimeout(r, wait));
    await new Promise((r) => requestAnimationFrame(r));
    forceGc();
    await new Promise((r) => setTimeout(r, 0));
    forceGc();
    retained = reachable();
    if (retained.length === 0) break;
  }
  // Indexes of instances and hosts still reachable.
  return { perMount, retained };
}

// A: 100 Text Inputs in one reactive form.
const FIELDS = Array.from({ length: 100 }, (_, i) => `f${i}`);

@Component({
  imports: [ReactiveFormsModule, AuiTextInput],
  template: `
    <form [formGroup]="form">
      @for (f of fields; track f) {
        <aui-text-input [label]="'Field ' + f" [formControlName]="f" />
      }
    </form>
  `,
})
class HundredInputs {
  readonly fields = FIELDS;
  readonly form = new FormGroup(Object.fromEntries(FIELDS.map((f) => [f, new FormControl('', { nonNullable: true })])));
}

// B: 100,000 logical rows, virtual window, a template per cell.
interface Row {
  id: string;
  name: string;
  hours: number;
}
const ROWS: readonly Row[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, name: `Person ${i}`, hours: i % 40 }));

@Component({
  imports: [...AUI_DATA_TABLE],
  template: `
    <div style="block-size: 400px">
      <aui-data-table caption="People" [rows]="rows" [rowId]="byId" [virtual]="true" [pageSize]="null">
        <aui-column field="name" header="Name" rowHeader>
          <ng-template auiCell [auiCellOf]="rows" let-row><b class="name">{{ row.name }}</b></ng-template>
        </aui-column>
        <aui-column field="hours" header="Hours" type="number" />
      </aui-data-table>
    </div>
  `,
})
class HundredThousandRows {
  readonly rows = ROWS;
  readonly byId = (r: Row): string => r.id;
}

// C: dashboard.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const series = (id: string, k: number): ChartSeries => ({ id, label: id, values: MONTHS.map((_, i) => ((i + 1) * k) % 97) });
const TABLE: readonly Row[] = ROWS.slice(0, 1000);

@Component({
  imports: [AuiLineChart, AuiBarChart, AuiPieChart, AuiStatCard, AuiTabs, ...AUI_DATA_TABLE],
  template: `
    @for (s of stats; track s.label) {
      <aui-stat-card [label]="s.label" [value]="s.value" />
    }
    <aui-line-chart label="Hours" [x]="months" [series]="lines" />
    <aui-bar-chart label="Headcount" [categories]="months" [series]="bars" />
    <aui-pie-chart label="Teams" [slices]="slices" />
    <aui-line-chart label="Overtime" [x]="months" [series]="overtime()" />
    <aui-tabs label="Views" [tabs]="tabs" />
    <aui-data-table caption="People" [rows]="table" [rowId]="byId" [pageSize]="25">
      <aui-column field="name" header="Name" rowHeader />
      <aui-column field="hours" header="Hours" type="number" />
    </aui-data-table>
  `,
})
class Dashboard {
  readonly months = MONTHS;
  readonly stats = Array.from({ length: 6 }, (_, i) => ({ label: `Metric ${i}`, value: i * 1000 }));
  readonly lines = [series('planned', 7), series('actual', 11)];
  readonly bars = [series('2025', 5), series('2026', 13)];
  readonly overtime = signal([series('overtime', 3)]);
  readonly slices = [
    { id: 'core', label: 'Core', value: 12 },
    { id: 'web', label: 'Web', value: 8 },
    { id: 'ops', label: 'Ops', value: 5 },
  ];
  readonly tabs = [
    { id: 'a', label: 'Summary', content: 'Summary' },
    { id: 'b', label: 'Details', content: 'Details' },
  ];
  readonly table = TABLE;
  readonly byId = (r: Row): string => r.id;
}

describe('M6 benchmarks', () => {
  it('A: 100 inputs in a reactive form: mount and patch all values', async () => {
    const { ref, ms } = await mount(HundredInputs);
    expect(ref.location.nativeElement instanceof Element && ref.location.nativeElement.querySelectorAll('aui-text-input input').length).toBe(100);
    const appRef = TestBed.inject(ApplicationRef);
    const start = performance.now();
    ref.instance.form.patchValue(Object.fromEntries(FIELDS.map((f) => [f, `value ${f}`])));
    await appRef.whenStable();
    const patch = performance.now() - start;
    const last = document.querySelectorAll<HTMLInputElement>('aui-text-input input')[99];
    expect(last?.value).toBe('value f99');
    unmount(ref);
    results['A.mount'] = ms;
    results['A.patch'] = patch;
    expect(ms).toBeLessThan(BUDGET.aMount);
    expect(patch).toBeLessThan(BUDGET.aPatch);
  });

  it('B: 100,000 logical rows (virtual, auiCell): mount, scroll, bounded template views', async () => {
    const { ref, ms } = await mount(HundredThousandRows);
    const root: unknown = ref.location.nativeElement;
    if (!(root instanceof Element)) throw new Error('no host');
    const table = root.querySelector('table');
    expect(table?.getAttribute('aria-rowcount')).toBe('100001');
    const rendered = root.querySelectorAll('b.name').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(200);

    const region = root.querySelector<HTMLElement>('.aui-data-table__region');
    if (!region) throw new Error('no scroll region');
    const start = performance.now();
    region.scrollTop = region.scrollHeight / 2;
    region.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(r));
    await TestBed.inject(ApplicationRef).whenStable();
    const scroll = performance.now() - start;
    const names = Array.from(root.querySelectorAll('b.name'), (b) => b.textContent);
    expect(names.some((n) => /Person [1-9]\d{4}/.test(n))).toBe(true);
    // Released windows destroy their template views: the count stays bounded.
    expect(root.querySelectorAll('.aui-template').length).toBeLessThan(200);
    unmount(ref);
    results['B.mount'] = ms;
    results['B.scroll'] = scroll;
    expect(ms).toBeLessThan(BUDGET.bMount);
    expect(scroll).toBeLessThan(BUDGET.bScroll);
  });

  it('C: dashboard (4 charts, 6 stat cards, tabs, 1,000-row table): mount and update', async () => {
    const { ref, ms } = await mount(Dashboard);
    const root: unknown = ref.location.nativeElement;
    if (!(root instanceof Element)) throw new Error('no host');
    expect(root.querySelectorAll('svg').length).toBeGreaterThanOrEqual(4);
    ref.instance.overtime.set([series('overtime', 9)]);
    await TestBed.inject(ApplicationRef).whenStable();
    unmount(ref);
    results['C.mount'] = ms;
    expect(ms).toBeLessThan(BUDGET.cMount);
  });

  it('mount/unmount loops leave nothing retained (A x20, B x5, C x20)', async () => {
    const a = await loop(HundredInputs, 20);
    const b = await loop(HundredThousandRows, 5);
    const c = await loop(Dashboard, 20);
    results['loop.A.perMount'] = a.perMount;
    results['loop.B.perMount'] = b.perMount;
    results['loop.C.perMount'] = c.perMount;
    expect([a.retained, b.retained, c.retained]).toEqual([[], [], []]);
    expect(a.perMount).toBeLessThan(BUDGET.loopPerMount);
    expect(c.perMount).toBeLessThan(BUDGET.loopPerMount);
    expect(document.body.children.length).toBe(0);
  });
});
