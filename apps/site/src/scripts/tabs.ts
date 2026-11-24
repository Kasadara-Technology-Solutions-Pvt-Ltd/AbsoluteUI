// Tabs on component pages (R20-7): Showcase, Playground, and Examples. Without script
// every panel stays visible under its own label; with script, a WAI-ARIA tab list.
const STORAGE = 'aui-live-tab';

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE);
  } catch {
    return null;
  }
}

function init(root: HTMLElement, index: number): void {
  const panels = [...root.querySelectorAll<HTMLElement>(':scope > .aui-tabs__panel')];
  if (panels.length === 0) return;
  const list = document.createElement('div');
  // not-content: Starlight's prose spacing would add a top margin to every tab after the first.
  list.className = 'aui-tabs__list not-content';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Live example');
  const tabs = panels.map((panel, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'aui-tabs__tab';
    tab.setAttribute('role', 'tab');
    tab.id = `aui-tab-${String(index)}-${String(i)}`;
    panel.id = `aui-tabpanel-${String(index)}-${String(i)}`;
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.textContent = panel.dataset.tab ?? `Tab ${String(i + 1)}`;
    list.append(tab);
    return tab;
  });
  const select = (i: number, focus: boolean): void => {
    tabs.forEach((tab, j) => {
      const on = i === j;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[j]?.toggleAttribute('hidden', !on);
    });
    if (focus) tabs[i]?.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      select(i, false);
      try {
        localStorage.setItem(STORAGE, panels[i]?.dataset.tab ?? '');
      } catch {
        // Not remembered.
      }
    });
    tab.addEventListener('keydown', (e) => {
      const rtl = getComputedStyle(list).direction === 'rtl';
      const next = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
      if (next !== undefined) select((i + next + tabs.length) % tabs.length, true);
      else if (e.key === 'Home') select(0, true);
      else if (e.key === 'End') select(tabs.length - 1, true);
      else return;
      e.preventDefault();
    });
  });
  root.prepend(list);
  root.classList.add('aui-tabs--ready');
  const saved = panels.findIndex((p) => p.dataset.tab === remembered());
  select(saved >= 0 ? saved : 0, false);
}

function start(): void {
  document.querySelectorAll<HTMLElement>('[data-aui-tabs]').forEach((root, i) => {
    init(root, i);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
