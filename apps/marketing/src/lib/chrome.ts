// Site chrome: theme toggle (light default, optional dark), mobile navigation menu, and copy
// buttons. The saved theme is a per-viewer convenience in localStorage.
const THEME_KEY = 'aui-site-theme';

function setTheme(theme: 'light' | 'dark'): void {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable (private mode, blocked site data): the toggle still works for this page.
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) b.setAttribute('aria-pressed', String(theme === 'dark'));
}

function initMenu(): void {
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const nav = document.querySelector<HTMLElement>('#site-nav');
  if (!toggle || !nav) return;
  const setOpen = (open: boolean): void => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  matchMedia('(min-width: 1101px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}

/** Copy buttons: `data-copy` holds the text, or the text of the element `data-copy-target` points to. */
function initCopy(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', () => {
      const target = button.dataset.copyTarget ? document.getElementById(button.dataset.copyTarget) : null;
      const text = (target?.textContent ?? button.dataset.copy ?? '').trim();
      const label = button.textContent;
      const done = (message: string): void => {
        button.textContent = message;
        setTimeout(() => {
          button.textContent = label;
        }, 1600);
      };
      navigator.clipboard.writeText(text).then(
        () => {
          done('Copied');
        },
        () => {
          done('Copy failed');
        },
      );
    });
  }
}

export function initChrome(): void {
  const isDark = document.documentElement.dataset.theme === 'dark';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    button.setAttribute('aria-pressed', String(isDark));
    button.addEventListener('click', () => {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }
  initMenu();
  initCopy();
}
