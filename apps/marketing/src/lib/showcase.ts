// Theme showcase (MR-3): swatches on the page re-theme the live showcase frame through same-origin
// postMessage, and show the role tokens derived for that accent (rendered at build time).
export function initShowcase(): void {
  const root = document.querySelector<HTMLElement>('[data-showcase]');
  const frame = root?.querySelector<HTMLIFrameElement>('iframe');
  if (!root || !frame) return;
  const swatches = [...root.querySelectorAll<HTMLButtonElement>('[data-accent]')];
  const tokenPanels = [...root.querySelectorAll<HTMLElement>('[data-accent-tokens]')];
  let accent = swatches.find((s) => s.getAttribute('aria-pressed') === 'true')?.dataset.accent ?? 'cobalt';
  const dark = (): boolean => document.documentElement.dataset.theme === 'dark';
  const send = (): void => {
    frame.contentWindow?.postMessage({ type: 'aui-accent', accent, dark: dark() }, location.origin);
  };
  for (const swatch of swatches) {
    swatch.addEventListener('click', () => {
      accent = swatch.dataset.accent ?? accent;
      for (const s of swatches) s.setAttribute('aria-pressed', String(s === swatch));
      for (const p of tokenPanels) p.hidden = p.dataset.accentTokens !== accent;
      send();
    });
  }
  frame.addEventListener('load', send);
  // Follow the site's light/dark toggle.
  new MutationObserver(send).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
