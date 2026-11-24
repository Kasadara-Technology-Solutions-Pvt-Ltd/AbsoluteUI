// AbsoluteUI Theme Designer (SPEC section 10): edit a theme family, preview it live, see
// compliance as values change, and export or import it. Built with AbsoluteUI itself.
import { Select } from '@absoluteui/components/select';
import { Tabs } from '@absoluteui/components/tabs';
import { applyTheme, type ThemeMode } from '@absoluteui/theme';
import { builtInFamily, familyModes } from '@absoluteui/theme/designer';
import './src/consent.js';
import { chartsPanel } from './src/charts-panel.js';
import { compliancePanel } from './src/compliance-panel.js';
import { modeLabels, type DesignerContext, type Panel } from './src/context.js';
import { announce, button, byId, detail, el, hasNullableValue, host } from './src/dom.js';
import { componentsPanel, densitiesPanel, responsivePanel, seedsPanel, tokensPanel } from './src/editor.js';
import { filesPanel } from './src/files-panel.js';
import { previewPanel } from './src/preview.js';
import { Store, clearDraft, loadDraft } from './src/store.js';

applyTheme('absolute-default');

const store = new Store(loadDraft());
let mode: ThemeMode = 'light';
const modeListeners: ((m: ThemeMode) => void)[] = [];
const isMode = (v: unknown): v is ThemeMode => familyModes.some((m) => m === v);

const panels: readonly { id: Panel; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'components', label: 'Components' },
  { id: 'charts', label: 'Charts' },
  { id: 'densities', label: 'Densities' },
  { id: 'responsive', label: 'Responsive' },
  { id: 'seeds', label: 'Seeds' },
  { id: 'files', label: 'Files' },
];
const containers = new Map(panels.map((p) => [p.id, el('div', { className: 'td-panel' })]));
const content = (id: Panel): HTMLDivElement => {
  const c = containers.get(id);
  if (!c) throw new Error(`Missing panel ${id}`);
  return c;
};

// Header: mode being edited and previewed, undo/redo, reset.
const toolbar = byId('toolbar', HTMLDivElement);
const modeSelect = Select.create(host(toolbar), { label: 'Mode', options: familyModes.map((m) => ({ value: m, label: modeLabels[m] })), value: mode });
const undo = button(toolbar, 'Undo', { variant: 'ghost', size: 'sm', label: 'Undo (Ctrl+Z)' }, () => {
  store.undo();
});
const redo = button(toolbar, 'Redo', { variant: 'ghost', size: 'sm', label: 'Redo (Ctrl+Y)' }, () => {
  store.redo();
});
button(toolbar, 'Start over', { variant: 'ghost', size: 'sm', label: 'Start over from the built-in theme' }, () => {
  store.set(builtInFamily(), 'start over');
  clearDraft();
  announce('Started over from the built-in theme. Undo restores your work.');
});
const badge = byId('status-badge', HTMLSpanElement);
const title = byId('family-title', HTMLSpanElement);

const tabs = Tabs.create(byId('editor', HTMLDivElement), { label: 'Designer sections', tabs: panels.map((p) => ({ id: p.id, label: p.label, content: content(p.id) })), activation: 'manual' });

let revealers: { reveal(name: string): boolean }[] = [];
const ctx: DesignerContext = {
  store,
  mode: () => mode,
  setMode(next) {
    if (next === mode) return;
    mode = next;
    modeSelect.setValue(next);
    for (const l of modeListeners) l(next);
  },
  onModeChange(listener) {
    modeListeners.push(listener);
  },
  showPanel(panel) {
    tabs.select(panel);
  },
  revealToken(name) {
    const [tokensR, componentsR, chartsR] = revealers;
    if (tokensR) {
      ctx.showPanel('tokens');
      if (tokensR.reveal(name)) return;
    }
    if (chartsR && name.startsWith('chart-')) {
      ctx.showPanel('charts');
      if (chartsR.reveal(name)) return;
    }
    if (componentsR) {
      ctx.showPanel('components');
      componentsR.reveal(name);
    }
  },
};

modeSelect.host.addEventListener('aui-change', (e) => {
  const v = detail(e, hasNullableValue)?.value;
  if (isMode(v)) ctx.setMode(v);
});

revealers = [tokensPanel(content('tokens'), ctx), componentsPanel(content('components'), ctx), chartsPanel(content('charts'), ctx)];
densitiesPanel(content('densities'), ctx);
responsivePanel(content('responsive'), ctx);
seedsPanel(content('seeds'), ctx);
const files = filesPanel(content('files'), ctx);
previewPanel(byId('preview', HTMLElement), ctx);
compliancePanel(byId('compliance', HTMLElement), ctx, (report) => {
  badge.textContent = report.compliant ? 'Meets baseline' : 'Not compliant';
  badge.className = report.compliant ? 'td-badge td-badge--pass' : 'td-badge td-badge--fail';
  files.setReport(report);
});

const refreshHeader = (): void => {
  title.textContent = `${store.family.name} ${store.family.version}`;
  undo.element.disabled = !store.canUndo;
  redo.element.disabled = !store.canRedo;
};
store.subscribe((_, reason) => {
  refreshHeader();
  if (reason === 'undo' || reason === 'redo') announce(reason === 'undo' ? 'Undone.' : 'Redone.');
});
refreshHeader();

// Undo and redo shortcuts outside text fields (text fields keep their native undo).
document.addEventListener('keydown', (e) => {
  const target = e.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    store.undo();
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault();
    store.redo();
  }
});

document.documentElement.dataset.designerReady = 'true';
