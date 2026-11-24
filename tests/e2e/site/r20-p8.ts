// R20 P8 page: Diagram (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Diagram, layoutDiagram, type DiagramChangeDetail, type DiagramModel, type DiagramNodeActivateDetail, type DiagramSelectDetail } from '@absoluteui/components/diagram';
import { Stack } from '@absoluteui/components/layout';

declare global {
  interface Window {
    __auiReady?: boolean;
  }
}

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const workflow = (): DiagramModel => ({
  nodes: [
    { id: 'request', label: 'Leave request', shape: 'ellipse', width: 144, height: 56 },
    { id: 'manager', label: 'Manager approval', shape: 'diamond', height: 96 },
    { id: 'hr', label: 'HR check', shape: 'diamond', height: 96 },
    { id: 'approved', label: 'Approved', shape: 'rounded' },
    { id: 'rejected', label: 'Rejected', shape: 'rounded', locked: true },
    { id: 'archive', label: 'Leave records', shape: 'cylinder', width: 128, height: 80 },
  ],
  edges: [
    { id: 'e1', from: 'request', to: 'manager' },
    { id: 'e2', from: 'manager', to: 'hr', label: 'Yes' },
    { id: 'e3', from: 'manager', to: 'rejected', label: 'No' },
    { id: 'e4', from: 'hr', to: 'approved', label: 'OK' },
    { id: 'e5', from: 'hr', to: 'rejected', label: 'Not OK', dashed: true },
    { id: 'e6', from: 'approved', to: 'archive', routing: 'curved', arrowEnd: 'triangle' },
  ],
});

const view = byId('diagram-view');
Diagram.create(view, { label: 'Leave approval', model: workflow(), layout: { direction: 'TB' }, direction });
view.addEventListener('aui-node-activate', (e) => {
  byId('view-log').textContent = `Activated: ${(e as CustomEvent<DiagramNodeActivateDetail>).detail.node.label}`;
});

const edit = byId('diagram-edit');
Diagram.create(edit, { label: 'Expense approval', model: workflow(), editable: true, layout: { direction: 'LR' }, direction });
edit.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<DiagramChangeDetail>).detail;
  byId('edit-log').textContent = `${d.reason}: ${String(d.model.nodes.length)} nodes, ${String(d.model.edges.length)} edges`;
});
edit.addEventListener('aui-select', (e) => {
  const d = (e as CustomEvent<DiagramSelectDetail>).detail;
  byId('select-log').textContent = `Selected: ${[...d.nodes, ...d.edges].join(', ')}`;
});

// Performance budgets are measured by tests/e2e/perf-r20-p8.spec.ts (performance project, Chromium,
// one worker) through window.__aui, so the functional and axe tests do not render 300 extra nodes.
Object.assign(window, { __aui: { Diagram, layoutDiagram } });
window.__auiReady = true;
