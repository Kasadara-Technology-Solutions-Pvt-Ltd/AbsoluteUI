// Compliance panel (SPEC section 10.4, section 10.5): recalculated as values change; separate
// assessments per category, then every finding with rule, mode, measured and expected
// values, affected tokens (buttons that open the token), components, severity, and
// remediation. A non-compliant theme is disclosed prominently and never shown as compliant.
import { Select } from '@absoluteui/components/select';
import { assessCompliance, type ComplianceFinding, type ComplianceReport } from '@absoluteui/theme/designer';
import { modeLabels, type DesignerContext } from './context.js';
import { debounce, detail, el, hasNullableValue, host } from './dom.js';

type Filter = 'problems' | 'required' | 'all';
const filters: readonly { value: Filter; label: string }[] = [
  { value: 'problems', label: 'Failures and warnings' },
  { value: 'required', label: 'Required failures only' },
  { value: 'all', label: 'All results' },
];
const isFilter = (v: unknown): v is Filter => filters.some((f) => f.value === v);
const statusText: Readonly<Record<ComplianceFinding['status'], string>> = { pass: 'Pass', fail: 'Fail', warn: 'Warning', 'not-measurable': 'Not measurable' };
const MAX_LISTED = 150;

export function compliancePanel(parent: HTMLElement, ctx: DesignerContext, onReport: (report: ComplianceReport) => void): void {
  const statement = el('div', { className: 'td-compliance__statement', attrs: { role: 'status' } });
  parent.append(statement);
  const table = el('table', { className: 'td-table' });
  table.append(el('caption', { className: 'td-visually-hidden', text: 'Assessments by category' }));
  const head = el('thead', {}, el('tr', {}, ...['Assessment', 'Pass', 'Fail', 'Warn', 'N/M'].map((t) => el('th', { text: t, attrs: { scope: 'col' } }))));
  const tbody = el('tbody');
  table.append(head, tbody);
  parent.append(el('div', { className: 'td-table-wrap' }, table));

  let filter: Filter = 'problems';
  const filterSelect = Select.create(host(parent), { label: 'Show', options: filters.map((f) => ({ value: f.value, label: f.label })), value: filter });
  const count = el('p', { className: 'td-hint' });
  const list = el('ol', { className: 'td-findings', attrs: { 'aria-label': 'Compliance findings' } });
  parent.append(count, list);
  let report: ComplianceReport = assessCompliance(ctx.store.family);

  const renderFinding = (f: ComplianceFinding): HTMLLIElement => {
    const li = el('li', { className: `td-finding td-finding--${f.status}` });
    const title = el('p', { className: 'td-finding__title' }, el('strong', { text: `${statusText[f.status]}${f.required ? '' : ' (advisory)'}` }), ` | ${f.severity} | ${f.mode === 'all' ? 'all modes' : modeLabels[f.mode]}`);
    li.append(title, el('p', { className: 'td-finding__message', text: f.message }));
    const facts = el('dl', { className: 'td-finding__facts' });
    const fact = (term: string, value: string | Node): void => {
      facts.append(el('dt', { text: term }), el('dd', {}, value));
    };
    fact('Rule', f.rule);
    if (f.measured !== null) fact('Measured', f.expected ? `${f.measured} (needs ${f.expected})` : f.measured);
    if (f.tokens.length > 0) {
      const tokens = el('span', { className: 'td-finding__tokens' });
      for (const t of f.tokens) {
        const b = el('button', { className: 'td-link-button', text: t, attrs: { type: 'button', 'aria-label': `Edit ${t}` } });
        b.addEventListener('click', () => {
          if (f.mode !== 'all') ctx.setMode(f.mode);
          ctx.revealToken(t);
        });
        tokens.append(b);
      }
      fact('Tokens', tokens);
    }
    if (f.components.length > 0) fact('Components', f.components.join(', '));
    if (f.remediation) fact('Fix', f.remediation);
    li.append(facts);
    return li;
  };

  const render = (): void => {
    statement.replaceChildren(
      el('strong', { className: report.compliant ? 'td-badge td-badge--pass' : 'td-badge td-badge--fail', text: report.compliant ? 'Meets baseline' : 'Not compliant' }),
      el('span', { text: ` ${report.statement}` }),
    );
    statement.classList.toggle('td-compliance__statement--fail', !report.compliant);
    tbody.replaceChildren(
      ...report.categories.map((c) =>
        el(
          'tr',
          { className: c.category === 'contrast' ? 'td-table__group' : '' },
          el('th', { text: c.label, attrs: { scope: 'row' } }),
          el('td', { text: String(c.passed) }),
          el('td', { text: String(c.failed) }),
          el('td', { text: String(c.warnings) }),
          el('td', { text: String(c.notMeasurable) }),
        ),
      ),
    );
    const shown = report.findings.filter((f) => (filter === 'all' ? true : filter === 'required' ? f.required && f.status !== 'pass' && f.status !== 'warn' : f.status !== 'pass'));
    count.textContent = `${String(shown.length)} result${shown.length === 1 ? '' : 's'}${shown.length > MAX_LISTED ? `; showing the first ${String(MAX_LISTED)}` : ''}.`;
    list.replaceChildren(...shown.slice(0, MAX_LISTED).map(renderFinding));
    onReport(report);
  };
  filterSelect.host.addEventListener('aui-change', (e) => {
    const v = detail(e, hasNullableValue)?.value;
    if (isFilter(v)) {
      filter = v;
      render();
    }
  });
  ctx.store.subscribe(
    debounce(() => {
      report = assessCompliance(ctx.store.family);
      render();
    }, 150),
  );
  render();
}
