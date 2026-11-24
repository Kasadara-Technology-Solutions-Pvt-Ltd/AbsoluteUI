// Blocks page: category filter (toggle buttons) and preview widths per block.
type Width = 'desktop' | 'tablet' | 'mobile';
const isWidth = (v: string | undefined): v is Width => v === 'desktop' || v === 'tablet' || v === 'mobile';

export function initBlocks(): void {
  const root = document.querySelector<HTMLElement>('[data-blocks]');
  if (!root) return;
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-block]')];
  const status = root.querySelector<HTMLElement>('[data-blocks-status]');
  const filters = [...root.querySelectorAll<HTMLButtonElement>('[data-cat]:not([data-block])')];

  for (const button of filters) {
    button.addEventListener('click', () => {
      const cat = button.dataset.cat ?? 'all';
      for (const f of filters) f.setAttribute('aria-pressed', String(f === button));
      let shown = 0;
      for (const b of blocks) {
        const on = cat === 'all' || b.dataset.cat === cat;
        b.hidden = !on;
        if (on) shown += 1;
      }
      if (status) status.textContent = `${String(shown)} ${shown === 1 ? 'block' : 'blocks'} shown`;
    });
  }

  for (const block of blocks) {
    const canvas = block.querySelector<HTMLElement>('.canvas');
    const buttons = [...block.querySelectorAll<HTMLButtonElement>('.dev [data-width]')];
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const width = button.dataset.width;
        if (!canvas || !isWidth(width)) return;
        canvas.dataset.width = width;
        for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      });
    }
  }

  // Deep links (/blocks/#sign-in): show a hidden block's category first.
  const target = location.hash ? blocks.find((b) => `#${b.id}` === location.hash) : undefined;
  if (target?.hidden) filters.find((f) => f.dataset.cat === 'all')?.click();
}
