// Site-wide data for pages: navigation, external links, and generated figures.
// External URLs come from links.json (docs/PLAN-R4.md section 4.8, docs/PLAN-MARKETING-REDESIGN.md);
// `astro dev` uses the local dev servers so links work while developing.
import linksFile from './generated/links.json';
import statsFile from './generated/stats.json';

export const links = import.meta.env.DEV ? linksFile.dev : linksFile.build;
export const stats = statsFile;

const withSlash = (url: string): string => url.replace(/\/*$/, '/');
/**
 * A docs page. `path` is the page's site path (`/docs/guides/forms/`); `docsUrl` is the docs section
 * root: `/docs/` on the one website (docs/PLAN-ONE-SITE.md OS-3), the docs dev server in `astro dev`.
 */
export const docs = (path = '/docs/'): string => `${withSlash(links.docsUrl)}${path.replace(/^\/docs\/?/, '')}`;
/** The Theme Designer app: `/designer/` on the one website (OS-5). */
export const designer = (): string => withSlash(links.designerUrl);

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

// One website (OS-13): Docs and the Theme Designer are sections of this site, not external links.
export const NAV: readonly NavItem[] = [
  { label: 'Components', href: '/components/' },
  { label: 'Blocks', href: '/blocks/' },
  { label: 'Theme Designer', href: designer() },
  { label: 'Enterprise', href: '/enterprise/' },
  { label: 'Docs', href: docs() },
];

export const GET_STARTED = docs('/docs/getting-started/installation/');
export const ANGULAR_DOCS = docs('/docs/angular/');
/** MR-7: false while the packages are not on the public npm registry. */
export const npmPublic: boolean = links.npmPublic;
export const AZURE_REGISTRY = 'https://pkgs.dev.azure.com/kasadara/_packaging/AbsoluteUI/npm/registry/';

export const DOCS_GUIDES: readonly { title: string; path: string; summary: string }[] = [
  { title: 'Installation', path: '/docs/getting-started/installation/', summary: 'Install the packages and import styles.' },
  { title: 'Configuration', path: '/docs/getting-started/configuration/', summary: 'Global defaults for locale, time zone, density, and theme.' },
  { title: 'Security and CSP', path: '/docs/getting-started/security/', summary: 'Strict Content Security Policy and Trusted Types.' },
  { title: 'Forms and validation', path: '/docs/guides/forms/', summary: 'Native forms with validation and error summaries.' },
  { title: 'Dates and time zones', path: '/docs/guides/dates-and-time-zones/', summary: 'Plain dates, instants, and zoned date-times.' },
  { title: 'Business calendars', path: '/docs/guides/business-calendars/', summary: 'Weekends, holidays, and business-day arithmetic.' },
  { title: 'Theming', path: '/docs/guides/theming/', summary: 'Tokens, themes, density, and runtime switching.' },
  { title: 'Charts', path: '/docs/guides/charts/', summary: 'Accessible SVG charts with data tables.' },
  { title: 'Helpers and services', path: '/docs/guides/helpers-and-services/', summary: 'Tree-shakeable utility modules.' },
  { title: 'HTTP client', path: '/docs/guides/http/', summary: 'Interceptors, cancellation, and a typed error model (preview).' },
  { title: 'Icons', path: '/docs/guides/icons/', summary: 'Built-in icons and adapters for any icon library.' },
];

/** Whole numbers for display ("405"). */
export const n = (value: number): string => new Intl.NumberFormat('en-US').format(value);
export const date = (iso: string): string => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
