// Components gallery (docs/PLAN-R4.md section 4.5): search and category filters over server-rendered
// cards. Without JavaScript every card stays visible. The chosen tab is kept in the URL hash.
export function initGallery(): void {
  const root = document.querySelector<HTMLElement>('[data-gallery]');
  if (!root) return;
  const input = root.querySelector<HTMLInputElement>('input[type="search"]');
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const cards = [...root.querySelectorAll<HTMLElement>('[data-card]')];
  const empty = root.querySelector<HTMLElement>('[data-empty]');
  const status = root.querySelector<HTMLElement>('[data-status]');
  const tabIds = new Set(buttons.map((b) => b.dataset.tab ?? ''));

  let tab = location.hash.slice(1);
  if (!tabIds.has(tab)) tab = 'all';

  const apply = (): void => {
    const terms = (input?.value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      const tabs = (card.dataset.tabs ?? '').split(' ');
      const text = card.dataset.text ?? '';
      const visible = (tab === 'all' || tabs.includes(tab)) && terms.every((t) => text.includes(t));
      card.hidden = !visible;
      if (visible) shown++;
    }
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    if (empty) empty.hidden = shown > 0;
    if (status) status.textContent = `${String(shown)} ${shown === 1 ? 'component' : 'components'} shown`;
  };

  for (const b of buttons) {
    b.addEventListener('click', () => {
      tab = b.dataset.tab ?? 'all';
      history.replaceState(null, '', tab === 'all' ? location.pathname : `#${tab}`);
      apply();
    });
  }
  input?.addEventListener('input', apply);
  apply();
}
