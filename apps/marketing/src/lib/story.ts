// Scroll story (docs/PLAN-MARKETING-REDESIGN.md section 4.5): the sticky panel shows the code and
// preview of the step nearest the middle of the viewport. Every panel is server-rendered; on small
// screens and under reduced motion the steps are simply stacked (CSS) and all stay readable.
export function initStory(): void {
  const root = document.querySelector<HTMLElement>('[data-story]');
  if (!root) return;
  const steps = [...root.querySelectorAll<HTMLElement>('[data-step]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-story-panel]')];
  const show = (id: string): void => {
    for (const s of steps) s.classList.toggle('is-active', s.dataset.step === id);
    for (const p of panels) p.hidden = p.dataset.storyPanel !== id;
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting && e.target instanceof HTMLElement && e.target.dataset.step) show(e.target.dataset.step);
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  for (const s of steps) io.observe(s);
  // Keyboard and screen-reader users reach steps by focus too.
  for (const s of steps) {
    s.addEventListener('focusin', () => {
      if (s.dataset.step) show(s.dataset.step);
    });
  }
}
