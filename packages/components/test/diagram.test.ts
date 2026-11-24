import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  Diagram,
  diagramToSvg,
  layoutDiagram,
  type DiagramChangeDetail,
  type DiagramModel,
  type DiagramNodeActivateDetail,
  type DiagramOptions,
  type DiagramSelectDetail,
} from '@absoluteui/components/diagram';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const workflow = (): DiagramModel => ({
  nodes: [
    { id: 'request', label: 'Request', shape: 'ellipse' },
    { id: 'manager', label: 'Manager approval', shape: 'diamond', height: 96 },
    { id: 'hr', label: 'HR check', shape: 'diamond', height: 96 },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected', locked: true },
  ],
  edges: [
    { id: 'e1', from: 'request', to: 'manager' },
    { id: 'e2', from: 'manager', to: 'hr', label: 'Yes' },
    { id: 'e3', from: 'manager', to: 'rejected', label: 'No' },
    { id: 'e4', from: 'hr', to: 'approved', label: 'OK' },
    { id: 'e5', from: 'hr', to: 'rejected', label: 'Not OK', dashed: true },
  ],
});

// Unit tests load no component CSS: the rules that decide sizing and hit testing.
const LAYOUT_CSS = `
.aui-diagram__viewport { position: relative; overflow: hidden; block-size: 480px; }
.aui-diagram__svg { display: block; inline-size: 100%; block-size: 100%; }
.aui-diagram__editor { position: absolute; }
.aui-diagram__link-hit { fill: none; stroke: transparent; stroke-width: 14; pointer-events: stroke; }
.aui-diagram__shape { fill: white; stroke: black; }
`;

function mount(options: Partial<DiagramOptions> = {}): { diagram: Diagram; host: HTMLDivElement } {
  const host = document.createElement('div');
  host.style.setProperty('inline-size', '900px');
  const style = document.createElement('style');
  style.textContent = LAYOUT_CSS;
  document.body.append(style, host);
  const diagram = Diagram.create(host, { label: 'Leave approval', model: workflow(), locale: 'en-US', ...options });
  return { diagram, host };
}

const node = (host: HTMLElement, id: string): SVGGElement => {
  const el = host.querySelector<SVGGElement>(`[data-aui-node="${id}"]`);
  if (!el) throw new Error(`node ${id} not rendered`);
  return el;
};

const changes = (host: HTMLElement): DiagramChangeDetail[] => {
  const out: DiagramChangeDetail[] = [];
  host.addEventListener('aui-change', (e) => out.push((e as CustomEvent<DiagramChangeDetail>).detail));
  return out;
};

describe('layoutDiagram', () => {
  it('ranks a flowchart top-down without overlaps, breaking cycles', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id, width: 100, height: 40 }));
    const result = layoutDiagram(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'b', to: 'd' }, { from: 'd', to: 'a' }], { direction: 'TB' });
    expect(result.ranks.get('a')).toBe(0);
    expect(result.ranks.get('b')).toBe(1);
    expect(result.ranks.get('c')).toBe(2);
    const boxes = [...result.positions.values()];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i];
      const q = boxes[j];
      if (!p || !q) continue;
      expect(p.x < q.x + 100 && q.x < p.x + 100 && p.y < q.y + 40 && q.y < p.y + 40).toBe(false);
    }
  });

  it('lays out left to right and as a tree', () => {
    const nodes = ['a', 'b', 'c'].map((id) => ({ id, width: 120, height: 48 }));
    const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }];
    const lr = layoutDiagram(nodes, edges, { direction: 'LR', rankGap: 50 });
    expect(lr.positions.get('b')?.x).toBe(170);
    const tree = layoutDiagram(nodes, edges, { algorithm: 'tree', nodeGap: 20 });
    const a = tree.positions.get('a');
    const b = tree.positions.get('b');
    const c = tree.positions.get('c');
    expect(a && b && c ? a.x + 60 : 0).toBe(b && c ? (b.x + c.x + 120) / 2 : -1);
  });
});

describe('Diagram', () => {
  it('validates the model before rendering', () => {
    const host = document.createElement('div');
    document.body.append(host);
    expect(() => Diagram.create(host, { label: 'x', model: { nodes: [{ id: 'a', label: 'A' }], edges: [{ id: 'e', from: 'a', to: 'missing' }] } })).toThrow(AbsoluteUIError);
    expect(() => Diagram.create(host, { label: 'x', model: { nodes: [{ id: 'a', label: 'A', width: 4 }], edges: [] } })).toThrow(AbsoluteUIError);
    expect(() => Diagram.create(host, { label: 'x', model: { nodes: [{ id: 'a', label: 'A' }], edges: [{ id: 'e', from: 'a', to: 'a', toPort: 'nope' }] } })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
  });

  it('renders listboxes with named options and lays out nodes without positions', () => {
    const { diagram, host } = mount();
    const list = host.querySelector('[role="listbox"]');
    expect(list?.getAttribute('aria-label')).toBe('Leave approval: nodes');
    expect(host.querySelectorAll('.aui-diagram__node[role="option"]')).toHaveLength(5);
    expect(host.querySelectorAll('.aui-diagram__link[role="option"]')).toHaveLength(5);
    expect(node(host, 'manager').getAttribute('aria-label')).toBe('Manager approval, decision, leads to HR check (Yes), Rejected (No), comes from Request');
    const m = diagram.model;
    expect(m.nodes.every((n) => typeof n.x === 'number' && typeof n.y === 'number')).toBe(true);
    const request = m.nodes.find((n) => n.id === 'request');
    const manager = m.nodes.find((n) => n.id === 'manager');
    expect((request?.y ?? 0) < (manager?.y ?? 0)).toBe(true);
    expect(diagram.describe().split('\n')).toHaveLength(5);
  });

  it('moves focus to the nearest node with arrow keys and activates with Enter', async () => {
    const { host } = mount({ layout: { direction: 'TB' } });
    const activated: string[] = [];
    host.addEventListener('aui-node-activate', (e) => activated.push((e as CustomEvent<DiagramNodeActivateDetail>).detail.id));
    node(host, 'request').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(node(host, 'manager'));
    await userEvent.keyboard('{Enter}');
    expect(activated).toEqual(['manager']);
    expect(node(host, 'manager').getAttribute('tabindex')).toBe('0');
    expect(node(host, 'request').getAttribute('tabindex')).toBe('-1');
  });

  it('selects with Space and Shift+Space and reports aui-select', async () => {
    const { diagram, host } = mount();
    const selections: DiagramSelectDetail[] = [];
    host.addEventListener('aui-select', (e) => selections.push((e as CustomEvent<DiagramSelectDetail>).detail));
    node(host, 'request').focus();
    await userEvent.keyboard(' ');
    node(host, 'hr').focus();
    await userEvent.keyboard('{Shift>} {/Shift}');
    expect(diagram.selection.nodes.sort()).toEqual(['hr', 'request']);
    expect(selections.length).toBe(2);
    expect(node(host, 'hr').getAttribute('aria-selected')).toBe('true');
  });

  it('connects two nodes with the keyboard (C on the source, C on the target) and undoes it', async () => {
    const { diagram, host } = mount({ editable: true, model: { nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 300, y: 0 }], edges: [] } });
    const log = changes(host);
    node(host, 'a').focus();
    await userEvent.keyboard('c');
    expect(node(host, 'a').classList.contains('aui-diagram__node--source')).toBe(true);
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('c');
    expect(diagram.model.edges).toHaveLength(1);
    expect(diagram.model.edges[0]).toMatchObject({ from: 'a', to: 'b' });
    expect(log.at(-1)?.reason).toBe('connect');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(diagram.model.edges).toHaveLength(0);
    expect(log.at(-1)?.reason).toBe('undo');
    expect(diagram.redo()).toBe(true);
    expect(diagram.model.edges).toHaveLength(1);
  });

  it('refuses self connections and canConnect vetoes', () => {
    const { diagram } = mount({ editable: true, canConnect: (_from, to) => to.id !== 'request' });
    expect(diagram.addEdge({ from: 'hr', to: 'hr' })).toBeNull();
    expect(diagram.addEdge({ from: 'approved', to: 'request' })).toBeNull();
    expect(diagram.addEdge({ from: 'approved', to: 'manager' })).not.toBeNull();
  });

  it('moves a node in move mode by grid steps as one undo step', async () => {
    const { diagram, host } = mount({ editable: true, gridSize: 10, model: { nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }], edges: [] } });
    const log = changes(host);
    node(host, 'a').focus();
    await userEvent.keyboard('m');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    expect(diagram.model.nodes[0]).toMatchObject({ x: 20, y: 10 });
    expect(log.map((c) => c.reason)).toEqual(['move']);
    node(host, 'a').focus();
    await userEvent.keyboard('m');
    await userEvent.keyboard('{ArrowRight}{Escape}');
    expect(diagram.model.nodes[0]).toMatchObject({ x: 20, y: 10 });
    diagram.undo();
    expect(diagram.model.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('edits a label inline with a plain text input', async () => {
    const { diagram, host } = mount({ editable: true });
    node(host, 'approved').focus();
    await userEvent.keyboard('{Enter}');
    const input = host.querySelector<HTMLInputElement>('.aui-diagram__editor');
    expect(input?.hidden).toBe(false);
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard('{Control>}a{/Control}<b>Paid</b>{Enter}');
    expect(diagram.model.nodes.find((n) => n.id === 'approved')?.label).toBe('<b>Paid</b>');
    expect(node(host, 'approved').querySelector('b')).toBeNull();
    expect(node(host, 'approved').textContent).toContain('<b>Paid</b>');
    expect(document.activeElement).toBe(node(host, 'approved'));
  });

  it('deletes the selection with its edges but keeps locked nodes', async () => {
    const { diagram, host } = mount({ editable: true });
    node(host, 'rejected').focus();
    await userEvent.keyboard('{Delete}');
    expect(diagram.model.nodes.some((n) => n.id === 'rejected')).toBe(true);
    node(host, 'hr').focus();
    await userEvent.keyboard('{Delete}');
    expect(diagram.model.nodes.some((n) => n.id === 'hr')).toBe(false);
    expect(diagram.model.edges.map((e) => e.id).sort()).toEqual(['e1', 'e3']);
  });

  it('copies and pastes nodes with the edges between them', () => {
    const { diagram } = mount({ editable: true });
    diagram.select(['manager', 'hr']);
    expect(diagram.copy()).toBe(2);
    const pasted = diagram.paste();
    expect(pasted).toHaveLength(2);
    const m = diagram.model;
    expect(m.nodes).toHaveLength(7);
    expect(m.edges.filter((e) => pasted.includes(e.from) && pasted.includes(e.to))).toHaveLength(1);
    expect(diagram.selection.nodes.sort()).toEqual([...pasted].sort());
  });

  it('runs auto-layout keeping hand-moved nodes when asked', () => {
    const { diagram } = mount({ editable: true });
    diagram.moveNode('approved', 800, 800);
    diagram.layout({ direction: 'LR', keepPositions: true });
    expect(diagram.model.nodes.find((n) => n.id === 'approved')).toMatchObject({ x: 800, y: 800 });
    diagram.layout({ direction: 'LR' });
    expect(diagram.model.nodes.find((n) => n.id === 'approved')?.x).not.toBe(800);
  });

  it('shows the text alternative table on request', async () => {
    const { host } = mount();
    const toggle = host.querySelector<HTMLButtonElement>('.aui-diagram__text-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.click();
    const rows = host.querySelectorAll('.aui-diagram__table tbody tr');
    expect(rows).toHaveLength(5);
    expect(host.querySelector('.aui-diagram__table caption')?.textContent).toBe('Leave approval: nodes and connections');
    await Promise.resolve();
  });

  it('pans with arrow keys on the canvas and zooms with keys', async () => {
    const { diagram, host } = mount();
    const viewport = host.querySelector<HTMLElement>('.aui-diagram__viewport');
    viewport?.focus();
    const scene = host.querySelector('.aui-diagram__scene');
    const before = scene?.getAttribute('transform');
    await userEvent.keyboard('{ArrowLeft}');
    expect(scene?.getAttribute('transform')).not.toBe(before);
    const scale = diagram.scale;
    await userEvent.keyboard('+');
    expect(diagram.scale).toBeGreaterThan(scale);
  });

  it('exports an SVG without style attributes or script', () => {
    const { diagram } = mount();
    const markup = diagramToSvg(diagram);
    expect(markup.startsWith('<svg')).toBe(true);
    // Long labels wrap into one <tspan> per line, as on screen.
    expect(markup).toContain('>Manager</tspan>');
    expect(markup).toContain('>approval</tspan>');
    expect(markup).not.toContain('style=');
    expect(markup).not.toContain('<script');
  });

  it('cleans up on destroy', () => {
    const { diagram, host } = mount({ editable: true });
    diagram.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-diagram')).toBe(false);
  });
});
