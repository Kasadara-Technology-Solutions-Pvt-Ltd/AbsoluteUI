// ARIA tabs (WAI-ARIA APG, manual activation on click, automatic on arrow keys): a [data-tabs]
// container holds [role="tab"][data-tab] buttons and [data-panel] panels. Only the selected tab
// is in the tab order; arrows, Home, and End move between tabs. Panels in a group are matched by
// value, so one tab can switch several panels (for example code and preview).
export function initTabs(root: ParentNode = document): void {
  for (const group of root.querySelectorAll<HTMLElement>('[data-tabs]')) {
    const tabs = [...group.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')].filter((t) => t.closest('[data-tabs]') === group);
    const panels = [...group.querySelectorAll<HTMLElement>('[data-panel]')].filter((p) => p.closest('[data-tabs]') === group);
    const select = (tab: HTMLElement, focus: boolean): void => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      }
      for (const p of panels) p.hidden = p.dataset.panel !== tab.dataset.tab;
      if (focus) tab.focus();
      group.dispatchEvent(new CustomEvent('site-tabchange', { detail: { tab: tab.dataset.tab }, bubbles: true }));
    };
    for (const tab of tabs) {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
      tab.addEventListener('click', () => {
        select(tab, false);
      });
      tab.addEventListener('keydown', (event) => {
        const i = tabs.indexOf(tab);
        const vertical = tab.closest('[role="tablist"]')?.getAttribute('aria-orientation') === 'vertical';
        const next = vertical ? 'ArrowDown' : 'ArrowRight';
        const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
        let target: HTMLElement | undefined;
        if (event.key === next) target = tabs[(i + 1) % tabs.length];
        else if (event.key === prev) target = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (event.key === 'Home') target = tabs[0];
        else if (event.key === 'End') target = tabs[tabs.length - 1];
        if (!target) return;
        event.preventDefault();
        select(target, true);
      });
    }
  }
}
