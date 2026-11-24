// Reference tables (R20-28): label each cell with its column header, and show a table as stacked
// cards (docs.css .aui-table--stacked) when its columns cannot all get the 220px minimum in the
// available width, so tables never scroll horizontally.
const MIN_COLUMN = 220;

function columns(table: HTMLTableElement): number {
  return table.querySelector('tr')?.children.length ?? 0;
}

function label(table: HTMLTableElement): void {
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  if (headers.length === 0) return;
  for (const row of table.querySelectorAll('tbody tr')) {
    [...row.children].forEach((cell, i) => {
      const text = headers[i];
      if (text) cell.setAttribute('data-label', text);
      // Empty cells (no default, for example) are left out of the stacked layout.
      if (cell.textContent.trim() === '') cell.setAttribute('data-empty', '');
    });
  }
}

function layout(tables: readonly HTMLTableElement[], width: number): void {
  for (const table of tables) table.classList.toggle('aui-table--stacked', columns(table) * MIN_COLUMN > width);
}

function start(): void {
  const content = document.querySelector<HTMLElement>('.sl-markdown-content');
  if (!content) return;
  const tables = [...content.querySelectorAll<HTMLTableElement>('table')];
  if (tables.length === 0) return;
  tables.forEach(label);
  layout(tables, content.clientWidth);
  new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? content.clientWidth;
    layout(tables, width);
  }).observe(content);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
