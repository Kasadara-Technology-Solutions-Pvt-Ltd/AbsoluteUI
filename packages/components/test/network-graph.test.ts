import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { NetworkGraph, type NetworkGraphNodePinDetail, type NetworkGraphOptions } from '@absoluteui/components/network-graph';

// R20 P11 (docs/PLAN-R20.md): Network Graph. Written with the component; run in P12 (R20-9).
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(width = 640): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', `${String(width)}px`);
  document.body.append(el);
  return el;
}

const focused = (): string | null | undefined => document.activeElement?.getAttribute('aria-label');

const base: NetworkGraphOptions = {
  label: 'Team collaboration',
  nodes: [
    { id: 'ana', label: 'Ana', group: 'design' },
    { id: 'ben', label: 'Ben', group: 'eng' },
    { id: 'chi', label: 'Chi', group: 'eng' },
    { id: 'dev', label: 'Dev', group: 'product' },
    { id: 'eve', label: 'Eve' },
  ],
  edges: [
    { source: 'ana', target: 'ben', weight: 3 },
    { source: 'ben', target: 'chi' },
    { source: 'chi', target: 'dev' },
  ],
  animate: false,
};

describe('NetworkGraph', () => {
  it('labels nodes with group and neighbors and builds an adjacency table', () => {
    const chart = NetworkGraph.create(host(), { ...base, dataTable: 'visible' });
    const nodes = [...chart.element.querySelectorAll('.aui-network-graph__node')];
    expect(nodes).toHaveLength(5);
    expect(nodes[1]?.getAttribute('aria-label')).toBe('Ben, eng, 2 connections: Ana and Chi');
    expect(nodes[4]?.getAttribute('aria-label')).toBe('Eve, Other, 0 connections');
    expect(chart.summary).toContain('Most connected: Ben (2 connections).');
    expect(chart.summary).toContain('Not connected: Eve.');
    const rows = [...chart.host.querySelectorAll('.aui-chart__table tbody tr')].map((r) => r.textContent);
    expect(rows[0]).toBe('Anadesign1Ben (weight 3)');
  });

  it('lays out deterministically for a seed', () => {
    const a = NetworkGraph.create(host(), { ...base, seed: 5 });
    const b = NetworkGraph.create(host(), { ...base, seed: 5 });
    expect(a.positions).toEqual(b.positions);
    const c = NetworkGraph.create(host(), { ...base, seed: 6 });
    expect(c.positions).not.toEqual(a.positions);
  });

  it('computes the layout without animation under reduced motion configuration', () => {
    configureAbsoluteUI({ animation: 'none' });
    const chart = NetworkGraph.create(host(), { ...base, animate: true });
    const p = chart.positions;
    expect(Number.isFinite(p.ana?.x)).toBe(true);
    expect(chart.element.querySelector('.aui-network-graph__node')?.getAttribute('d')).toMatch(/^M/);
  });

  it('moves between connected nodes, steps in data order, and highlights neighbors', async () => {
    const chart = NetworkGraph.create(host(), base);
    chart.element.querySelector<SVGElement>('[tabindex="0"]')?.focus();
    expect(focused()).toMatch(/^Ana/);
    expect(chart.host.classList.contains('aui-network-graph--lit')).toBe(true);
    expect(chart.element.querySelectorAll('.aui-network-graph__lit').length).toBe(3);
    await userEvent.keyboard('{PageDown}');
    expect(focused()).toMatch(/^Ben/);
    await userEvent.keyboard('{End}');
    expect(focused()).toMatch(/^Eve/);
    for (const key of ['{ArrowRight}', '{ArrowLeft}', '{ArrowUp}', '{ArrowDown}']) await userEvent.keyboard(key);
    expect(focused()).toMatch(/^Eve/);
  });

  it('pins with Shift+Arrow and unpins with U, emitting aui-node-pin', async () => {
    const el = host();
    const chart = NetworkGraph.create(el, base);
    const pins: NetworkGraphNodePinDetail[] = [];
    el.addEventListener('aui-node-pin', (e) => pins.push((e as CustomEvent<NetworkGraphNodePinDetail>).detail));
    const before = chart.positions.ana?.x ?? 0;
    chart.element.querySelector<SVGElement>('[tabindex="0"]')?.focus();
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(pins[0]).toMatchObject({ id: 'ana', pinned: true, source: 'keyboard' });
    expect(chart.positions.ana?.x).toBeGreaterThan(before);
    expect(chart.pins.map((p) => p.id)).toEqual(['ana']);
    await userEvent.keyboard('u');
    expect(pins[1]).toMatchObject({ id: 'ana', pinned: false });
    expect(chart.pins).toEqual([]);
  });

  it('hides groups from the legend and validates input', async () => {
    const chart = NetworkGraph.create(host(), base);
    const legend = [...chart.host.querySelectorAll<HTMLButtonElement>('.aui-chart__legend-item')];
    expect(legend.map((b) => b.textContent)).toEqual(['design', 'eng', 'product', 'Other']);
    await userEvent.click(legend[1]!);
    expect(chart.hiddenSeries).toEqual(['eng']);
    expect(chart.element.querySelectorAll('.aui-network-graph__node')).toHaveLength(3);
    expect(() => NetworkGraph.create(host(), { ...base, edges: [{ source: 'ana', target: 'ana' }] })).toThrow(AbsoluteUIError);
    expect(() => NetworkGraph.create(host(), { ...base, edges: [{ source: 'ana', target: 'zed' }] })).toThrow(AbsoluteUIError);
    expect(() => { chart.update({ seed: -1 }); }).toThrow(AbsoluteUIError);
  });
});
