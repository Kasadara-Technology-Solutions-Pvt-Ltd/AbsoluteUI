// Site search (Ctrl+K or /): a small index of marketing pages, components, and docs
// guides, built at build time (/search.json). Results are rendered with textContent only.
export interface SearchEntry {
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly url: string;
  readonly keywords: string;
}

const MAX_RESULTS = 12;

export function score(entry: SearchEntry, terms: readonly string[]): number {
  const title = entry.title.toLowerCase();
  const rest = `${entry.summary} ${entry.keywords}`.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.startsWith(term)) total += 6;
    else if (title.includes(term)) total += 4;
    else if (rest.includes(term)) total += 1;
    else return 0;
  }
  return total;
}

export function searchIndex(index: readonly SearchEntry[], query: string): SearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return [];
  return index
    .map((entry) => ({ entry, s: score(entry, terms) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.entry.title.localeCompare(b.entry.title))
    .slice(0, MAX_RESULTS)
    .map((r) => r.entry);
}

function isEntry(value: unknown): value is SearchEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return ['kind', 'title', 'summary', 'url', 'keywords'].every((k) => typeof v[k] === 'string');
}

export function initSearch(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#search');
  const input = dialog?.querySelector<HTMLInputElement>('input');
  const list = dialog?.querySelector<HTMLUListElement>('.search-results');
  const status = dialog?.querySelector<HTMLElement>('[data-search-status]');
  if (!dialog || !input || !list || !status) return;

  let index: SearchEntry[] | null = null;
  const load = async (): Promise<SearchEntry[]> => {
    if (index) return index;
    try {
      const response = await fetch('/search.json', { headers: { accept: 'application/json' } });
      const data: unknown = response.ok ? await response.json() : [];
      index = Array.isArray(data) ? data.filter(isEntry) : [];
    } catch {
      index = [];
    }
    return index;
  };

  let active = -1;
  const links = (): HTMLAnchorElement[] => [...list.querySelectorAll('a')];
  const select = (i: number): void => {
    const all = links();
    active = all.length ? (i + all.length) % all.length : -1;
    all.forEach((a, j) => {
      a.setAttribute('aria-selected', String(j === active));
    });
    const current = all[active];
    if (current) {
      input.setAttribute('aria-activedescendant', current.id);
      current.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const render = async (): Promise<void> => {
    const query = input.value.trim();
    const results = searchIndex(await load(), query);
    list.replaceChildren();
    results.forEach((r, i) => {
      const item = document.createElement('li');
      item.setAttribute('role', 'presentation');
      const a = document.createElement('a');
      a.href = r.url;
      a.id = `search-result-${String(i)}`;
      a.setAttribute('role', 'option');
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = r.kind;
      const title = document.createElement('span');
      title.textContent = r.title;
      const summary = document.createElement('small');
      summary.textContent = r.summary;
      a.append(kind, title, summary);
      item.append(a);
      list.append(item);
    });
    status.textContent = query ? (results.length ? `${String(results.length)} results` : `No results for "${query}"`) : '';
    status.hidden = !query || results.length > 0;
    select(0);
  };

  const open = (): void => {
    if (dialog.open) return;
    dialog.showModal();
    input.select();
    void load();
  };
  for (const b of document.querySelectorAll('[data-open-search]')) b.addEventListener('click', open);
  dialog.querySelector('[data-close]')?.addEventListener('click', () => {
    dialog.close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  input.addEventListener('input', () => void render());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      select(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      select(active - 1);
    } else if (event.key === 'Enter') {
      const target = links()[active];
      if (target) {
        event.preventDefault();
        target.click();
      }
    }
  });
  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
      event.preventDefault();
      open();
    }
  });
}
