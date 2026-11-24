// AbsoluteUI icon set gallery (docs/PLAN-R16-ICONS.md M3, R16-8): every icon of @absoluteui/icons/set
// in each variant it provides, with its animation presets, grouped by catalog category and rendered
// live in an example frame on the Icons API page. A category index and a search field (AbsoluteUI
// Text Input) narrow the list; each category is a table with one row per icon and one column per
// variant. Styles use the CSSOM (allowed under the frame's CSP); icons are decorative and every name
// is visible text.
import { isVectorIcon, renderIcon, type IconVariantName, type VectorIcon } from '@absoluteui/icons';
import * as set from '@absoluteui/icons/set';
import { TextInput } from '@absoluteui/components/text-input';
import { ICON_CATEGORIES } from './icon-categories.js';

const VARIANTS: readonly IconVariantName[] = ['outline', 'solid', 'duotone', 'multicolor'];

const host = document.getElementById('icon-set-gallery');
if (host) {
  const values: readonly unknown[] = Object.values(set);
  const byId = new Map<string, VectorIcon>(values.filter(isVectorIcon).map((icon) => [icon.id, icon]));
  const overlays = values
    .map((value) => (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'overlay' && 'id' in value && typeof value.id === 'string' ? value.id : ''))
    .filter(Boolean)
    .sort();

  // Catalog categories in order; an icon the catalog does not list still appears, under "Other".
  const listed = new Set(ICON_CATEGORIES.flatMap((c) => c.icons));
  const others = [...byId.keys()].filter((id) => !listed.has(id)).sort();
  const groups = [...ICON_CATEGORIES, ...(others.length ? [{ id: 'other', name: 'Other', icons: others }] : [])]
    .map((c) => ({ ...c, icons: c.icons.map((id) => byId.get(id)).filter((icon): icon is VectorIcon => icon !== undefined) }))
    .filter((c) => c.icons.length > 0);

  const cellStyle = { padding: '0.25rem 0.5rem' };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, style?: Partial<Record<string, string>>): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (style) Object.assign(node.style, style);
    return node;
  };

  const summary = el('p', `${String(byId.size)} icons in ${String(groups.length)} categories; a dash marks a variant an icon does not provide. Overlays: ${overlays.join(', ')}.`, { margin: '0 0 0.75rem' });

  // Category index: links to each section, with its icon count.
  const index = el('nav', undefined, { display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1rem', margin: '0 0 0.75rem', fontSize: '0.875rem' });
  index.setAttribute('aria-label', 'Icon categories');
  const indexLinks = new Map<string, HTMLAnchorElement>();
  for (const group of groups) {
    const link = el('a', `${group.name} (${String(group.icons.length)})`);
    link.href = `#icons-${group.id}`;
    indexLinks.set(group.id, link);
    index.append(link);
  }

  const searchHost = el('div', undefined, { maxWidth: '22rem', margin: '0 0 1rem' });
  const search = TextInput.create(searchHost, { label: 'Find an icon', type: 'search', description: 'Filters by icon name or category.', autocomplete: 'off', spellcheck: false });
  const status = el('p', '', { margin: '0 0 1rem', fontSize: '0.875rem' });
  status.setAttribute('role', 'status');

  const sections: { group: (typeof groups)[number]; section: HTMLElement; rows: { id: string; row: HTMLTableRowElement }[] }[] = [];
  for (const group of groups) {
    const section = el('section', undefined, { margin: '0 0 1.5rem' });
    section.id = `icons-${group.id}`;
    const heading = el('h3', `${group.name} (${String(group.icons.length)})`, { margin: '0 0 0.5rem', fontSize: '1rem' });
    heading.id = `icons-${group.id}-title`;
    section.setAttribute('aria-labelledby', heading.id);

    const table = el('table', undefined, { borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' });
    const head = el('tr');
    for (const text of ['Icon', ...VARIANTS, 'Animations']) {
      const th = el('th', text, { ...cellStyle, textAlign: 'start', borderBottom: '1px solid currentColor' });
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    const rows: { id: string; row: HTMLTableRowElement }[] = [];
    for (const icon of group.icons) {
      const row = el('tr');
      const name = el('th', undefined, { ...cellStyle, textAlign: 'start', fontWeight: 'normal' });
      name.scope = 'row';
      name.append(el('code', icon.id));
      row.append(name);
      for (const variant of VARIANTS) {
        const cell = el('td', undefined, { ...cellStyle, fontSize: '1.5rem', lineHeight: '1' });
        if (icon.variants[variant]) cell.append(renderIcon(icon, { variant }));
        else cell.textContent = '-';
        row.append(cell);
      }
      row.append(el('td', (icon.animations ?? []).map((a) => `${a.preset} (${a.trigger})`).join(', ') || '-', cellStyle));
      body.append(row);
      rows.push({ id: icon.id, row });
    }
    table.append(thead, body);
    section.append(heading, table);
    sections.push({ group, section, rows });
  }

  // Search: show matching rows, hide categories without a match, and report the count.
  const filter = (): void => {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    for (const { group, section, rows } of sections) {
      const inCategory = group.name.toLowerCase().includes(query);
      let visible = 0;
      for (const { id, row } of rows) {
        const match = query === '' || inCategory || id.includes(query);
        row.hidden = !match;
        if (match) visible += 1;
      }
      section.hidden = visible === 0;
      const link = indexLinks.get(group.id);
      if (link) link.hidden = visible === 0;
      shown += visible;
    }
    status.textContent = query === '' ? '' : `${String(shown)} ${shown === 1 ? 'icon matches' : 'icons match'} "${query}".`;
  };
  search.host.addEventListener('aui-input', filter);

  host.append(summary, index, searchHost, status, ...sections.map((s) => s.section));
}
