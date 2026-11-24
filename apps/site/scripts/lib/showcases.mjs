// Showcases (R19, docs/PLAN-R19-DOCS-EXAMPLES.md): fully featured live examples, one per group of
// related controls. Each module lives in apps/site/src/showcases and is type-checked with the repo.
// `components` lists every component page that embeds the showcase (first under "Examples").
import { join } from 'node:path';
import { root } from './shared.mjs';

const dir = join(root, 'apps', 'site', 'src', 'showcases');

/** @type {{ id: string, title: string, file: string, minHeight: number, components: string[] }[]} */
export const SHOWCASES = [
  {
    id: 'forms',
    title: 'Employee profile form',
    file: join(dir, 'forms.ts'),
    minHeight: 1500,
    components: ['form', 'form-field', 'fieldset', 'validation-message', 'error-summary', 'text-input', 'textarea', 'number-input', 'select', 'combobox', 'multi-select', 'checkbox', 'checkbox-group', 'radio-group', 'switch', 'slider'],
  },
  { id: 'rich-text', title: 'Announcement editor', file: join(dir, 'rich-text.ts'), minHeight: 900, components: ['rich-text-editor'] },
  // R20 P7: generated forms.
  { id: 'schema-form', title: 'Form builder', file: join(dir, 'schema-form.ts'), minHeight: 2200, components: ['schema-form', 'form-builder'] },
  { id: 'buttons', title: 'Buttons and toolbars', file: join(dir, 'buttons.ts'), minHeight: 700, components: ['button', 'button-group', 'toggle-group'] },
  {
    id: 'datetime',
    title: 'Leave request',
    file: join(dir, 'datetime.ts'),
    minHeight: 1600,
    components: ['date-input', 'date-picker', 'date-time-picker', 'time-picker', 'calendar', 'date-range-picker', 'duration-picker', 'business-calendar'],
  },
  { id: 'periods', title: 'Reporting periods', file: join(dir, 'periods.ts'), minHeight: 700, components: ['month-picker', 'quarter-picker', 'year-picker'] },
  { id: 'recurrence', title: 'Meeting series', file: join(dir, 'recurrence.ts'), minHeight: 1100, components: ['recurrence-picker', 'schedule-picker'] },
  { id: 'auth', title: 'Sign-in and account security', file: join(dir, 'auth.ts'), minHeight: 1100, components: ['password-input', 'password-strength-meter', 'otp-input', 'session-warning-dialog'] },
  { id: 'upload', title: 'Document upload', file: join(dir, 'upload.ts'), minHeight: 900, components: ['file-upload', 'upload-queue'] },
  { id: 'navigation', title: 'Application shell', file: join(dir, 'navigation.ts'), minHeight: 900, components: ['sidebar', 'menu-bar', 'menu', 'context-menu', 'tabs', 'breadcrumb', 'pagination', 'stepper'] },
  { id: 'overlays', title: 'Overlays', file: join(dir, 'overlays.ts'), minHeight: 700, components: ['dialog', 'drawer', 'bottom-sheet', 'popover', 'tooltip', 'hover-card'] },
  { id: 'feedback', title: 'Status center', file: join(dir, 'feedback.ts'), minHeight: 1100, components: ['alert', 'inline-message', 'toast', 'progress-bar', 'spinner', 'skeleton'] },
  { id: 'layout', title: 'Team profile', file: join(dir, 'layout.ts'), minHeight: 1000, components: ['layout', 'card', 'typography', 'badge', 'kbd', 'avatar', 'avatar-group', 'tag-group'] },
  { id: 'disclosure', title: 'Help center', file: join(dir, 'disclosure.ts'), minHeight: 1000, components: ['accordion', 'collapsible', 'scroll-area', 'carousel'] },
  // R20 P9: preference inputs.
  {
    id: 'preferences',
    title: 'Personal preferences',
    file: join(dir, 'preferences.ts'),
    minHeight: 2200,
    components: ['color-picker', 'rating', 'transfer-list', 'cascader', 'mention-input', 'masked-input', 'signature-pad'],
  },
  // P4: data.
  { id: 'data-table', title: 'Employee directory', file: join(dir, 'data-table.ts'), minHeight: 900, components: ['data-table'] },
  { id: 'data-grid', title: 'Ledger', file: join(dir, 'data-grid.ts'), minHeight: 900, components: ['data-grid'] },
  { id: 'pivot', title: 'Payroll pivot', file: join(dir, 'pivot.ts'), minHeight: 1000, components: ['pivot-grid'] },
  { id: 'sortable', title: 'Quarterly priorities', file: join(dir, 'sortable.ts'), minHeight: 600, components: ['sortable-list'] },
  { id: 'org-chart', title: 'Organization', file: join(dir, 'org-chart.ts'), minHeight: 900, components: ['org-chart'] },
  // R20 P3: workspace primitives.
  { id: 'workspace', title: 'Workspace layout', file: join(dir, 'workspace.ts'), minHeight: 1000, components: ['splitter', 'virtual-list', 'empty-state'] },
  // R20 P8: diagram.
  { id: 'diagram', title: 'Process designer', file: join(dir, 'diagram.ts'), minHeight: 1400, components: ['diagram'] },
  // R20 P10: documents and content.
  { id: 'documents', title: 'Document center', file: join(dir, 'documents.ts'), minHeight: 2600, components: ['file-manager', 'image-viewer', 'code-viewer', 'timeline', 'tour'] },
  // R20 P4: trees and commands.
  { id: 'tree', title: 'Navigation and commands', file: join(dir, 'tree.ts'), minHeight: 1300, components: ['tree-view', 'tree-select', 'command-palette'] },
  // P5: charts and dashboard.
  { id: 'charts-basic', title: 'Sales report', file: join(dir, 'charts-basic.ts'), minHeight: 1200, components: ['line-chart', 'bar-chart', 'pie-chart', 'sparkline'] },
  { id: 'charts-advanced', title: 'Analysis', file: join(dir, 'charts-advanced.ts'), minHeight: 1700, components: ['scatter-chart', 'combo-chart', 'waterfall-chart', 'histogram', 'heatmap', 'box-plot'] },
  { id: 'charts-kpi', title: 'Quarter targets', file: join(dir, 'charts-kpi.ts'), minHeight: 1400, components: ['gauge', 'radar-chart', 'treemap', 'funnel-chart', 'bullet-chart'] },
  // R20 P11: special charts.
  { id: 'charts-special', title: 'Advanced visualizations', file: join(dir, 'charts-special.ts'), minHeight: 2400, components: ['candlestick-chart', 'network-graph', 'calendar-heatmap'] },
  { id: 'dashboard', title: 'Configurable dashboard', file: join(dir, 'dashboard.ts'), minHeight: 1400, components: ['dashboard', 'dashboard-grid', 'dashboard-widget', 'stat-card'] },
  // P6: planning and boards.
  { id: 'scheduler', title: 'Team calendar', file: join(dir, 'scheduler.ts'), minHeight: 900, components: ['scheduler'] },
  { id: 'kanban', title: 'Recruitment board', file: join(dir, 'kanban.ts'), minHeight: 900, components: ['kanban'] },
  { id: 'gantt', title: 'Project plan', file: join(dir, 'gantt.ts'), minHeight: 900, components: ['gantt'] },
  // R20 P5: conversation.
  { id: 'chat', title: 'Assistant', file: join(dir, 'chat.ts'), minHeight: 1100, components: ['chat', 'prompt-input'] },
  // R20-25: threaded comments.
  { id: 'discussion', title: 'Discussion', file: join(dir, 'discussion.ts'), minHeight: 1600, components: ['discussion'] },
];

/** Text of every `section(...)` and `annotate(...)` call in a showcase source (balanced parentheses). */
function annotationCalls(source) {
  const calls = [];
  for (const m of source.matchAll(/\b(?:section|annotate)\(/g)) {
    let depth = 0;
    let quote = null;
    for (let i = m.index + m[0].length - 1; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) {
        calls.push(source.slice(m.index, i + 1));
        break;
      }
    }
  }
  return calls;
}

/**
 * Focus mode (R20-26): every component of a multi-component showcase is declared by at least
 * one section or part (a literal array in a `section(...)` or `annotate(...)` call), and every
 * declared name belongs to the showcase. Returns the problems.
 */
export function checkShowcaseAnnotations(read) {
  const problems = [];
  for (const sc of SHOWCASES) {
    if (sc.components.length < 2) continue;
    const declared = new Set();
    for (const call of annotationCalls(read(sc.file))) {
      for (const array of call.matchAll(/\[([^[\]]*)\]/g)) for (const q of array[1].matchAll(/'([a-z][a-z0-9-]*)'/g)) declared.add(q[1]);
    }
    const missing = sc.components.filter((n) => !declared.has(n));
    const extra = [...declared].filter((n) => !sc.components.includes(n));
    if (missing.length) problems.push(`showcase ${sc.id}: no section declares ${missing.join(', ')}`);
    if (extra.length) problems.push(`showcase ${sc.id}: sections declare components it does not list: ${extra.join(', ')}`);
  }
  return problems;
}

/** The shared kit every showcase imports (scanned for stylesheets too). */
export const KIT = join(dir, 'kit.ts');
