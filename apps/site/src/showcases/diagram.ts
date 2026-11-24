// Process designer showcase: a leave approval workflow (request, manager
// approval, HR check, approved or rejected) laid out automatically, with a direction and
// algorithm switch, edit mode (palette, ports, keyboard connect and move, inline labels),
// undo and redo, SVG and PNG export, and the model JSON updated live.
import { Diagram, downloadDiagram, type DiagramChangeDetail, type DiagramLayoutAlgorithm, type DiagramLayoutDirection, type DiagramModel, type DiagramRouting } from '@absoluteui/components/diagram';
import { action, choice, createShowcase, hostIn, section, status, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Process designer',
  description: 'A leave approval route. Switch the layout, turn on edit mode to add steps from the palette, drag from a port (or press C on two nodes) to connect, press M to move a node with the arrow keys, Enter to rename, and Delete to remove. Every edit can be undone; the model below is what you would save.',
});

const model: DiagramModel = {
  groups: [{ id: 'approvals', label: 'Approvals' }],
  nodes: [
    { id: 'request', label: 'Leave request submitted', shape: 'ellipse', width: 176, height: 64 },
    { id: 'manager', label: 'Manager approval', shape: 'diamond', width: 176, height: 104, group: 'approvals' },
    { id: 'hr', label: 'HR check: balance and blackout dates', shape: 'diamond', width: 192, height: 112, group: 'approvals' },
    { id: 'approved', label: 'Approved: calendar updated', shape: 'rounded' },
    { id: 'rejected', label: 'Rejected: employee notified', shape: 'rounded' },
    { id: 'records', label: 'Leave records', shape: 'cylinder', width: 136, height: 80 },
  ],
  edges: [
    { id: 'submit', from: 'request', to: 'manager' },
    { id: 'm-yes', from: 'manager', to: 'hr', label: 'Approve' },
    { id: 'm-no', from: 'manager', to: 'rejected', label: 'Decline' },
    { id: 'hr-yes', from: 'hr', to: 'approved', label: 'OK' },
    { id: 'hr-no', from: 'hr', to: 'rejected', label: 'Over balance', dashed: true },
    { id: 'store', from: 'approved', to: 'records', routing: 'curved', arrowEnd: 'triangle' },
  ],
};

let algorithm: DiagramLayoutAlgorithm = 'layered';
let direction: DiagramLayoutDirection = 'TB';

const host = hostIn(sc.stage);
const diagram = Diagram.create(host, {
  label: 'Leave approval',
  model,
  layout: { algorithm, direction },
  palette: [
    { shape: 'rounded', label: 'Step' },
    { shape: 'diamond', label: 'Decision', width: 176, height: 104 },
    { shape: 'ellipse', label: 'Start or end', width: 160, height: 60 },
    { shape: 'document', label: 'Form' },
    { shape: 'cylinder', label: 'Records', width: 136, height: 80 },
  ],
  // A finished request never goes back to the start.
  canConnect: (_from, to) => to.id !== 'request',
});
const live = status(sc.stage);

const jsonSection = section(sc, 'Model (JSON)');
const pre = document.createElement('pre');
pre.className = 'sc-json';
pre.tabIndex = 0;
pre.setAttribute('aria-label', 'Diagram model');
jsonSection.append(pre);
const show = (): void => {
  pre.textContent = JSON.stringify(diagram.model, null, 2);
};
show();

host.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<DiagramChangeDetail>).detail;
  show();
  live.textContent = `${d.reason}: ${String(d.model.nodes.length)} steps, ${String(d.model.edges.length)} connections`;
  sc.log('diagram aui-change', { reason: d.reason, ids: d.ids });
});
sc.listen(host, ['aui-select', 'aui-node-activate', 'aui-zoom'], 'diagram');

const relayout = (): void => {
  diagram.layout({ algorithm, direction });
};
choice(
  sc,
  'Layout direction',
  [
    { value: 'TB', label: 'Top to bottom' },
    { value: 'LR', label: 'Left to right' },
    { value: 'BT', label: 'Bottom to top' },
    { value: 'RL', label: 'Right to left' },
  ],
  direction,
  (value) => {
    direction = value;
    relayout();
  },
);
choice(
  sc,
  'Layout algorithm',
  [
    { value: 'layered', label: 'Layered (flowchart)' },
    { value: 'tree', label: 'Tree' },
  ],
  algorithm,
  (value) => {
    algorithm = value;
    relayout();
  },
);
choice<DiagramRouting>(
  sc,
  'Connectors',
  [
    { value: 'orthogonal', label: 'Orthogonal' },
    { value: 'curved', label: 'Curved' },
    { value: 'straight', label: 'Straight' },
  ],
  'orthogonal',
  (routing) => {
    diagram.update({ routing });
  },
);
toggle(sc, 'Edit mode', false, (editable) => {
  diagram.update({ editable });
});
toggle(sc, 'Snap to grid', true, (snapToGrid) => {
  diagram.update({ snapToGrid });
});
action(sc, 'Undo', () => {
  diagram.undo();
});
action(sc, 'Redo', () => {
  diagram.redo();
});
action(sc, 'Tidy up (keep moved steps)', () => {
  diagram.layout({ algorithm, direction, keepPositions: true });
});
action(sc, 'Fit', () => {
  diagram.fit();
});
action(sc, 'Export SVG', () => {
  void downloadDiagram(diagram, { format: 'svg', fileName: 'leave-approval' });
});
action(sc, 'Export PNG', () => {
  void downloadDiagram(diagram, { format: 'png', fileName: 'leave-approval' });
});
