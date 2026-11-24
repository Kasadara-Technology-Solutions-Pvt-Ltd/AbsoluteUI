// Analytics consent (as R14-7 on the docs site): Microsoft Clarity loads only after the visitor
// accepts. Nothing is requested from Clarity before that; the choice is kept in localStorage and
// can be changed from the footer (any element with data-consent-reset).
// One website, one consent and one Clarity project for every section (docs/PLAN-ONE-SITE.md OS-10):
// the same storage key and project as the home page (apps/marketing/src/lib/consent.ts).
const CLARITY_ID = 'z3l6x2l3z2';
const STORAGE = 'aui-site-analytics-consent';
const CLARITY_HOSTS = new Set(['www.clarity.ms', 'scripts.clarity.ms']);
type Choice = 'granted' | 'denied';

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };
interface TrustedTypesLike {
  createPolicy(name: string, rules: { createScriptURL: (input: string) => string | null }): unknown;
}
declare global {
  interface Window {
    clarity?: ClarityFn;
    trustedTypes?: TrustedTypesLike;
  }
}

function read(): Choice | null {
  try {
    const value = localStorage.getItem(STORAGE);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

function write(choice: Choice | null): void {
  try {
    if (choice) localStorage.setItem(STORAGE, choice);
    else localStorage.removeItem(STORAGE);
  } catch {
    // Storage blocked: the banner shows again on the next visit.
  }
}

const isClarityUrl = (input: string): boolean => {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && CLARITY_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

/**
 * The page enforces Trusted Types, and the Clarity loader assigns plain strings to script.src.
 * The `default` policy (created only after consent) accepts Clarity script URLs and nothing else;
 * HTML and script sinks stay blocked.
 */
function allowClarityScripts(): void {
  try {
    window.trustedTypes?.createPolicy('default', { createScriptURL: (input) => (isClarityUrl(input) ? input : null) });
  } catch {
    // A default policy exists already (Clarity was loaded before on this page).
  }
}

function loadClarity(): void {
  if (window.clarity) return;
  allowClarityScripts();
  const stub: ClarityFn = (...args: unknown[]) => {
    (stub.q ??= []).push(args);
  };
  window.clarity = stub;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
  document.head.append(script);
  window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
}

/** Expires Clarity's first-party cookies on this host and its parent domains (Clarity may set them on either). */
function clearClarityCookies(): void {
  const parts = location.hostname.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i += 1) domains.push(`; domain=.${parts.slice(i).join('.')}`);
  for (const name of ['_clck', '_clsk']) {
    for (const domain of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
  }
}

function banner(): HTMLElement {
  const box = document.createElement('section');
  box.className = 'td-consent';
  box.setAttribute('aria-label', 'Analytics consent');
  const text = document.createElement('p');
  text.textContent =
    'We use Microsoft Clarity to see how the Theme Designer is used, which sets cookies and records page interactions. Your themes stay in this browser either way. You can change this later from the footer. ';
  const more = document.createElement('a');
  more.href = '/privacy/';
  more.textContent = 'Privacy Policy';
  text.append(more);
  const actions = document.createElement('div');
  actions.className = 'td-consent-actions';
  for (const [label, choice] of [['Accept analytics', 'granted'], ['Decline', 'denied']] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = choice === 'granted' ? 'td-btn td-btn-primary' : 'td-btn';
    button.textContent = label;
    button.addEventListener('click', () => {
      write(choice);
      box.remove();
      if (choice === 'granted') loadClarity();
    });
    actions.append(button);
  }
  box.append(text, actions);
  return box;
}

function init(): void {
  const choice = read();
  if (choice === 'granted') loadClarity();
  else if (choice === null) document.body.append(banner());
  for (const reset of document.querySelectorAll<HTMLElement>('[data-consent-reset]')) {
    reset.addEventListener('click', () => {
      // Withdrawing consent: tell Clarity, remove its cookies, and reload without it.
      if (read() === 'granted') window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
      clearClarityCookies();
      write(null);
      location.reload();
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
