import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import type { CalendarHeatmapDay } from '@absoluteui/components/calendar-heatmap';
import type { CandlestickPoint } from '@absoluteui/components/candlestick-chart';
import type { NetworkEdge, NetworkNode } from '@absoluteui/components/network-graph';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiCalendarHeatmap } from '../src/calendar-heatmap/index.js';
import { AuiCandlestickChart } from '../src/candlestick-chart/index.js';
import { AuiNetworkGraph } from '../src/network-graph/index.js';

// docs/PLAN-R20.md P11: generated chart components (smoke tests; run in P12, R20-9).
beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {
    // Already initialized by another test file in the same run.
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

@Component({
  imports: [AuiCandlestickChart],
  template: `<aui-candlestick-chart label="Equity" [data]="data" [zoom]="true" [(zoomRange)]="range"></aui-candlestick-chart>`,
})
class CandlestickHost {
  readonly data: CandlestickPoint[] = Array.from({ length: 20 }, (_, i) => ({ date: plainDate(2026, 1, i + 1), open: 10 + i, high: 12 + i, low: 9 + i, close: 11 + i }));
  readonly range = signal<{ from: number; to: number } | null | undefined>({ from: 0, to: 9 });
}

@Component({
  imports: [AuiNetworkGraph],
  template: `<aui-network-graph label="Team" [nodes]="nodes" [edges]="edges" [animate]="false"></aui-network-graph>`,
})
class NetworkHost {
  readonly nodes: NetworkNode[] = [{ id: 'a', label: 'Ana' }, { id: 'b', label: 'Ben' }];
  readonly edges: NetworkEdge[] = [{ source: 'a', target: 'b' }];
}

@Component({
  imports: [AuiCalendarHeatmap],
  template: `<aui-calendar-heatmap label="Absences" [from]="from" [to]="to" [data]="data"></aui-calendar-heatmap>`,
})
class CalendarHost {
  readonly from = plainDate(2026, 1, 1);
  readonly to = plainDate(2026, 1, 31);
  readonly data: CalendarHeatmapDay[] = [{ date: plainDate(2026, 1, 5), value: 2 }];
}

describe('R20 P11 Angular charts', () => {
  it('<aui-candlestick-chart> applies [(zoomRange)]', async () => {
    const f = await render(CandlestickHost);
    expect((f.nativeElement as HTMLElement).querySelectorAll('.aui-candlestick-chart__candle').length).toBeLessThan(15);
  });

  it('<aui-network-graph> and <aui-calendar-heatmap> render their marks', async () => {
    const n = await render(NetworkHost);
    expect((n.nativeElement as HTMLElement).querySelectorAll('.aui-network-graph__node')).toHaveLength(2);
    TestBed.resetTestingModule();
    const c = await render(CalendarHost);
    expect((c.nativeElement as HTMLElement).querySelectorAll('.aui-calendar-heatmap__cell')).toHaveLength(31);
  });
});
