import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { layoutOrgChart, OrgChart, type OrgChartLoadErrorDetail, type OrgChartNodeMoveDetail, type OrgChartNode, type OrgChartNodeSelectDetail, type OrgChartZoomDetail } from '@absoluteui/components/org-chart';
import { downloadOrgChart, orgChartToSvg } from '@absoluteui/components/org-chart-export';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const people: OrgChartNode[] = [
  { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'CEO' },
  { id: 'cto', parentId: 'ceo', label: 'Grace Hopper', title: 'CTO' },
  { id: 'cfo', parentId: 'ceo', label: 'Mary Jackson', title: 'CFO' },
  { id: 'dev1', parentId: 'cto', label: 'Linus Dev', title: 'Engineer' },
  { id: 'dev2', parentId: 'cto', label: 'Margaret Hamilton', title: 'Engineer' },
  { id: 'acc', parentId: 'cfo', label: 'Katherine Johnson', title: 'Accountant', locked: true },
  { id: 'intern', parentId: 'dev1', label: 'Ivan Intern' },
];

// Unit tests load no component CSS: the layout rules that decide hit testing.
const LAYOUT_CSS = `
.aui-org-chart__viewport { position: relative; overflow: hidden; }
.aui-org-chart__canvas { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.aui-org-chart__links { position: absolute; inset: 0; pointer-events: none; }
.aui-org-chart__tree { position: absolute; inset: 0; }
.aui-org-chart__node { position: absolute; inline-size: var(--aui-org-chart-node-width); block-size: var(--aui-org-chart-node-height); }
.aui-org-chart__card { block-size: 100%; overflow: hidden; }
.aui-org-chart__toggle { position: absolute; bottom: 0; left: 50%; min-inline-size: 24px; min-block-size: 20px; transform: translate(-50%, 50%); }
`;

function mount(options: Partial<Parameters<typeof OrgChart.create>[1]> = {}): { chart: OrgChart; host: HTMLDivElement } {
  const host = document.createElement('div');
  host.style.setProperty('inline-size', '900px');
  const style = document.createElement('style');
  style.textContent = LAYOUT_CSS;
  document.body.append(style, host);
  const chart = OrgChart.create(host, { label: 'Company', nodes: people, locale: 'en-US', ...options });
  host.querySelector<HTMLElement>('.aui-org-chart__viewport')?.style.setProperty('block-size', '400px');
  return { chart, host };
}

const item = (host: HTMLElement, id: string): HTMLElement => host.querySelector<HTMLElement>(`[data-aui-node="${id}"]`)!;
const visible = (host: HTMLElement): string[] => [...host.querySelectorAll<HTMLElement>('[role="treeitem"]')].map((el) => el.dataset.auiNode ?? '');

describe('org chart layout', () => {
  const tree = { id: 'a', children: [{ id: 'b', children: [{ id: 'd', children: [] }, { id: 'e', children: [] }] }, { id: 'c', children: [] }] };
  const opts = { nodeWidth: 100, nodeHeight: 40, siblingGap: 20, levelGap: 30, orientation: 'vertical' as const };

  it('centers parents over their children and never overlaps a level', () => {
    const { boxes, edges, width, height } = layoutOrgChart([tree], opts);
    const x = (id: string): number => boxes.get(id)?.x ?? NaN;
    expect(x('b') + 50).toBe((x('d') + x('e')) / 2 + 50);
    expect(x('a') + 50).toBe((x('b') + x('c')) / 2 + 50);
    expect(x('e') - x('d')).toBe(120);
    expect(boxes.get('d')?.y).toBe(140);
    expect(height).toBe(40 * 3 + 30 * 2);
    expect(width).toBeGreaterThanOrEqual(3 * 100 + 2 * 20 - 100);
    expect(edges.find((e) => e.to === 'c')?.path).toMatch(/^M[\d.]+ 40V55H[\d.]+V70$/);
  });

  it('horizontal orientation swaps the axes; mirror flips the breadth axis', () => {
    const h = layoutOrgChart([tree], { ...opts, orientation: 'horizontal' });
    expect(h.boxes.get('b')?.x).toBe(130);
    expect(h.boxes.get('a')?.x).toBe(0);
    const v = layoutOrgChart([tree], opts);
    const m = layoutOrgChart([tree], { ...opts, mirror: true });
    expect(m.boxes.get('c')?.x).toBe(v.width - 100 - (v.boxes.get('c')?.x ?? 0));
  });

  it('packs a forest of roots side by side', () => {
    const { boxes } = layoutOrgChart([{ id: 'r1', children: [] }, { id: 'r2', children: [] }], opts);
    expect(boxes.get('r2')?.x).toBe(120);
  });
});

describe('OrgChart', () => {
  it('renders an ARIA tree in reading order with level, set size, position, and expansion', () => {
    const { host } = mount();
    const tree = host.querySelector('[role="tree"]');
    expect(tree?.getAttribute('aria-label')).toBe('Company');
    // expandDepth 2: the CEO and the managers are expanded; Linus Dev is not.
    expect(visible(host)).toEqual(['ceo', 'cto', 'dev1', 'dev2', 'cfo', 'acc']);
    const dev2 = item(host, 'dev2');
    expect([dev2.getAttribute('aria-level'), dev2.getAttribute('aria-setsize'), dev2.getAttribute('aria-posinset')]).toEqual(['3', '2', '2']);
    expect(item(host, 'dev1').getAttribute('aria-expanded')).toBe('false');
    expect(dev2.hasAttribute('aria-expanded')).toBe(false);
    expect(item(host, 'ceo').tabIndex).toBe(0);
    expect(item(host, 'cto').tabIndex).toBe(-1);
    // Name from content: label, title (separators hidden visually).
    expect(item(host, 'cto').textContent).toContain('Grace Hopper, CTO');
    expect(host.querySelector('.aui-org-chart__links path')?.getAttribute('d')).toMatch(/^M/);
    expect(host.querySelector('.aui-org-chart__toolbar')?.getAttribute('aria-label')).toBe('Company controls');
  });

  it('keyboard follows the tree: arrows, Home/End, typeahead, Enter selects', async () => {
    const { host } = mount();
    const selected: string[] = [];
    host.addEventListener('aui-node-select', (e) => selected.push((e as CustomEvent<OrgChartNodeSelectDetail>).detail.id));
    item(host, 'ceo').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item(host, 'cto'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(item(host, 'dev1'));
    await userEvent.keyboard('{ArrowRight}');
    expect(item(host, 'dev1').getAttribute('aria-expanded')).toBe('true');
    expect(visible(host)).toContain('intern');
    await userEvent.keyboard('{ArrowLeft}');
    expect(item(host, 'dev1').getAttribute('aria-expanded')).toBe('false');
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(item(host, 'cto'));
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(item(host, 'acc'));
    await userEvent.keyboard('{Home}m');
    expect(document.activeElement).toBe(item(host, 'dev2'));
    await userEvent.keyboard('{Enter}');
    expect(selected).toEqual(['dev2']);
    expect(item(host, 'dev2').getAttribute('aria-selected')).toBe('true');
    expect(item(host, 'dev2').tabIndex).toBe(0);
  });

  it('RTL mirrors Left and Right', async () => {
    const { host } = mount({ direction: 'rtl' });
    item(host, 'cto').focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(item(host, 'dev1'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(item(host, 'cto'));
  });

  it('pointer: the chip toggles, a click selects', async () => {
    const { host } = mount();
    await userEvent.click(item(host, 'dev1').querySelector('.aui-org-chart__toggle')!, { force: true });
    expect(visible(host)).toContain('intern');
    await userEvent.click(item(host, 'cfo'), { force: true });
    expect(item(host, 'cfo').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(item(host, 'cfo'));
  });

  it('loads children lazily with aria-busy, and reports failures', async () => {
    let fail = true;
    const nodes: OrgChartNode[] = [{ id: 'root', parentId: null, label: 'Root' }, { id: 'lazy', parentId: 'root', label: 'Lazy Team', hasChildren: true }];
    const errors: OrgChartLoadErrorDetail[] = [];
    let resolve: () => void = () => undefined;
    const { chart, host } = mount({
      nodes,
      loadChildren: (node) => new Promise((ok, ko) => {
        resolve = () => {
          if (fail) ko(new Error('offline'));
          else ok([{ id: 'kid', parentId: node.id, label: 'Kid' }]);
        };
      }),
    });
    host.addEventListener('aui-load-error', (e) => errors.push((e as CustomEvent<OrgChartLoadErrorDetail>).detail));
    expect(item(host, 'lazy').getAttribute('aria-expanded')).toBe('false');
    let done = chart.setExpanded('lazy', true);
    expect(item(host, 'lazy').getAttribute('aria-busy')).toBe('true');
    resolve();
    await done;
    expect(errors[0]?.id).toBe('lazy');
    expect(item(host, 'lazy').getAttribute('aria-expanded')).toBe('false');
    expect(item(host, 'lazy').hasAttribute('aria-busy')).toBe(false);
    fail = false;
    done = chart.setExpanded('lazy', true);
    resolve();
    await done;
    expect(visible(host)).toEqual(['root', 'lazy', 'kid']);
    expect(chart.nodes.map((n) => n.id)).toEqual(['root', 'lazy', 'kid']);
  });

  it('zooms with buttons and keys within limits, fits, and emits aui-zoom', async () => {
    const { chart, host } = mount({ minZoom: 0.5, maxZoom: 1.5 });
    const zooms: number[] = [];
    host.addEventListener('aui-zoom', (e) => zooms.push((e as CustomEvent<OrgChartZoomDetail>).detail.scale));
    const zoomIn = host.querySelector<HTMLButtonElement>('[data-aui-action="zoomIn"]')!;
    expect(zoomIn.getAttribute('aria-label')).toBe('Zoom in');
    await userEvent.click(zoomIn);
    expect(chart.scale).toBeCloseTo(1.25);
    await userEvent.click(zoomIn);
    expect(chart.scale).toBe(1.5);
    expect(zoomIn.getAttribute('aria-disabled')).toBe('true');
    item(host, 'ceo').focus();
    await userEvent.keyboard('---');
    expect(chart.scale).toBe(0.768);
    chart.zoomTo(0.01);
    expect(chart.scale).toBe(0.5);
    expect(zooms.at(-1)).toBe(0.5);
    chart.fit();
    expect(chart.scale).toBeLessThanOrEqual(1);
    const canvas = host.querySelector<HTMLElement>('.aui-org-chart__canvas');
    expect(canvas?.style.transform).toContain('scale(');
  });

  it('Ctrl + wheel zooms; a plain wheel does not', () => {
    const { chart, host } = mount();
    const viewport = host.querySelector('.aui-org-chart__viewport')!;
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(chart.scale).toBe(1);
    const e = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    viewport.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(chart.scale).toBeCloseTo(1.25);
  });

  it('search, pathTo, and reveal expand ancestors, highlight the path, and focus the node', () => {
    const { chart, host } = mount({ expandDepth: 0 });
    expect(visible(host)).toEqual(['ceo']);
    expect(chart.search('ivan')).toEqual(['intern']);
    expect(chart.search('engineer')).toEqual(['dev1', 'dev2']);
    expect(chart.pathTo('intern')).toEqual(['ceo', 'cto', 'dev1', 'intern']);
    chart.reveal('intern');
    expect(visible(host)).toContain('intern');
    expect(document.activeElement).toBe(item(host, 'intern'));
    expect(item(host, 'cto').classList.contains('aui-org-chart__node--path')).toBe(true);
    expect(item(host, 'cfo').classList.contains('aui-org-chart__node--path')).toBe(false);
    expect(host.querySelectorAll('.aui-org-chart__link--path')).toHaveLength(3);
    chart.clearHighlight();
    expect(host.querySelectorAll('.aui-org-chart__link--path')).toHaveLength(0);
  });

  it('collapsing a focused manager keeps focus on the manager', async () => {
    const { host } = mount();
    item(host, 'dev2').focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(item(host, 'cto'));
    expect(visible(host)).not.toContain('dev2');
  });

  it('validates nodes: duplicate ids, unknown parents, and cycles', () => {
    const bad = (nodes: unknown[]): unknown => {
      try {
        OrgChart.create(document.createElement('div'), { label: 'x', nodes: nodes as OrgChartNode[] });
      } catch (e) {
        return e;
      }
      return null;
    };
    expect(bad([{ id: 'a', parentId: null, label: 'A' }, { id: 'a', parentId: null, label: 'B' }])).toBeInstanceOf(AbsoluteUIError);
    expect(bad([{ id: 'a', parentId: 'nope', label: 'A' }])).toBeInstanceOf(AbsoluteUIError);
    expect(bad([{ id: 'a', parentId: 'b', label: 'A' }, { id: 'b', parentId: 'a', label: 'B' }])).toBeInstanceOf(AbsoluteUIError);
    expect(bad([{ id: 'a', parentId: null, label: ' ' }])).toBeInstanceOf(AbsoluteUIError);
  });
});

describe('OrgChart editing', () => {
  it('moveNode refuses cycles, locked nodes, and canMove vetoes', () => {
    const { chart } = mount({ editable: true, canMove: (_node, parent) => parent?.id !== 'intern' });
    expect(chart.moveNode('cto', 'dev1')).toBe(false);
    expect(chart.moveNode('acc', 'cto')).toBe(false);
    expect(chart.moveNode('dev2', 'intern')).toBe(false);
    expect(chart.moveNode('dev2', 'cfo')).toBe(true);
    expect(chart.nodes.find((n) => n.id === 'dev2')?.parentId).toBe('cfo');
  });

  it('Ctrl+X then Ctrl+V re-parents, emits aui-node-move, and undo/redo restore it', async () => {
    const { chart, host } = mount({ editable: true });
    const moves: OrgChartNodeMoveDetail[] = [];
    host.addEventListener('aui-node-move', (e) => moves.push((e as CustomEvent<OrgChartNodeMoveDetail>).detail));
    item(host, 'dev2').focus();
    await userEvent.keyboard('{Control>}x{/Control}');
    expect(item(host, 'dev2').classList.contains('aui-org-chart__node--cut')).toBe(true);
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(item(host, 'acc'));
    await userEvent.keyboard('{Control>}v{/Control}');
    expect(moves[0]).toMatchObject({ reason: 'move', id: 'dev2', parentId: 'acc', previousParentId: 'cto', index: 0 });
    expect(moves[0]?.nodes.find((n) => n.id === 'dev2')?.parentId).toBe('acc');
    expect(document.activeElement).toBe(item(host, 'dev2'));
    expect(item(host, 'dev2').getAttribute('aria-level')).toBe('4');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(chart.nodes.find((n) => n.id === 'dev2')?.parentId).toBe('cto');
    expect(moves.at(-1)?.reason).toBe('undo');
    expect(chart.nodes.filter((n) => n.parentId === 'cto').map((n) => n.id)).toEqual(['dev1', 'dev2']);
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(chart.nodes.find((n) => n.id === 'dev2')?.parentId).toBe('acc');
    expect(chart.canRedo).toBe(false);
  });

  it('Escape cancels a cut; locked nodes cannot be cut', async () => {
    const { chart, host } = mount({ editable: true });
    item(host, 'acc').focus();
    await userEvent.keyboard('{Control>}x{/Control}');
    expect(host.querySelector('.aui-org-chart__node--cut')).toBeNull();
    item(host, 'dev1').focus();
    await userEvent.keyboard('{Control>}x{/Control}{Escape}');
    expect(host.querySelector('.aui-org-chart__node--cut')).toBeNull();
    expect(chart.canUndo).toBe(false);
  });

  it('single pointer: select, Move, select the manager, Move here', async () => {
    const { chart, host } = mount({ editable: true });
    const cut = host.querySelector<HTMLButtonElement>('[data-aui-action="cut"]')!;
    const paste = host.querySelector<HTMLButtonElement>('[data-aui-action="paste"]')!;
    expect(cut.hidden).toBe(false);
    await userEvent.click(item(host, 'dev1'), { force: true });
    await userEvent.click(cut);
    expect(cut.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(item(host, 'cfo'), { force: true });
    expect(paste.getAttribute('aria-disabled')).toBe('false');
    await userEvent.click(paste);
    expect(chart.nodes.find((n) => n.id === 'dev1')?.parentId).toBe('cfo');
    // Toolbar editing buttons exist only in edit mode.
    chart.update({ editable: false });
    expect(cut.hidden).toBe(true);
  });
});

describe('org chart export', () => {
  it('serializes the visible chart as SVG with inline paint and no classes or styles', () => {
    const { chart } = mount();
    chart.reveal('dev2');
    const svg = orgChartToSvg(chart);
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    expect(parsed.querySelector('title')?.textContent).toBe('Company');
    expect(parsed.querySelectorAll('rect')).toHaveLength(1 + 6);
    expect([...parsed.querySelectorAll('text')].map((t) => t.textContent)).toContain('Grace Hopper');
    expect(parsed.querySelectorAll('path')).toHaveLength(5);
    expect(svg).not.toMatch(/class=|style=/);
    expect(orgChartToSvg(chart, { background: 'transparent', title: false })).not.toContain('<title>Company</title><rect width="100%"');
  });

  it('validates export options', async () => {
    const { chart } = mount();
    expect(() => orgChartToSvg(chart, { scale: 9 })).toThrow(AbsoluteUIError);
    await expect(downloadOrgChart(chart, { format: 'svg', fileName: '../x' })).rejects.toThrow(AbsoluteUIError);
  });
});
