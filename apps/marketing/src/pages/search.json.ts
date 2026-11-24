// Search index (src/lib/search.ts): marketing pages, blocks, components (linking to the docs app),
// and docs guides. Static output, built with the site.
import gallery from '../generated/components.json';
import demos from '../generated/demos.json';
import blocks from '../../data/blocks.json';
import { DOCS_GUIDES, NAV, docs } from '../site';

const PAGES: readonly { title: string; url: string; summary: string; keywords: string }[] = [
  { title: 'Home', url: '/', summary: 'Framework-neutral enterprise UI components with zero runtime dependencies.', keywords: 'product overview' },
  { title: 'Components', url: '/components/', summary: 'Browse every component by category.', keywords: 'gallery inputs forms data charts scheduling' },
  { title: 'Blocks', url: '/blocks/', summary: 'Composed screens with TypeScript and Angular code.', keywords: 'templates screens examples dashboard sign-in' },
  { title: 'Theme Designer', url: '/designer/', summary: 'Design and export accessible themes.', keywords: 'tokens colours brand export app' },
  { title: 'About the Theme Designer', url: '/theme-designer/', summary: 'What the Theme Designer does: seeds, compliance, exports.', keywords: 'tokens colours brand export wcag' },
  { title: 'Accessibility', url: '/accessibility/', summary: 'Automated WCAG 2.2 AA testing and its scope.', keywords: 'wcag a11y axe report' },
  { title: 'Performance', url: '/performance/', summary: 'Measured budgets and environment.', keywords: 'speed budget report' },
  { title: 'Enterprise', url: '/enterprise/', summary: 'Security, supply chain, and licensing facts.', keywords: 'csp security procurement' },
  { title: 'Demos', url: '/demos/', summary: 'Reference applications built with AbsoluteUI.', keywords: 'hrms example' },
  { title: 'License', url: '/license/', summary: 'Open source under the Apache License 2.0.', keywords: 'terms legal' },
  { title: 'Security policy', url: '/security/', summary: 'Report a vulnerability.', keywords: 'disclosure' },
  { title: 'Security advisories', url: '/advisory/', summary: 'Published advisories.', keywords: 'cve' },
  { title: 'Privacy Policy', url: '/privacy/', summary: 'What the AbsoluteUI websites collect, and analytics consent.', keywords: 'privacy cookies clarity analytics consent gdpr dpdp' },
  { title: 'Terms of Use', url: '/terms/', summary: 'Terms for using the AbsoluteUI websites and the Theme Designer.', keywords: 'terms legal conditions' },
  { title: 'Third-party notices', url: '/notices/', summary: 'Fonts and open-source software used by the websites.', keywords: 'notices attribution fonts licenses copyright' },
];

export function GET(): Response {
  const entries = [
    ...PAGES.map((p) => ({ kind: 'Page', ...p })),
    ...blocks.blocks.map((b) => ({ kind: 'Block', title: b.title, url: `/blocks/#${b.id}`, summary: b.description, keywords: `block ${b.components.join(' ')}` })),
    ...demos.map((d) => ({ kind: 'Demo', title: d.name, url: `/demos/${d.id}/`, summary: d.summary, keywords: 'demo' })),
    ...gallery.components.map((c) => ({ kind: 'Component', title: c.displayName, url: docs(c.docsPath), summary: c.blurb, keywords: `${c.name} ${c.tab}` })),
    ...DOCS_GUIDES.map((g) => ({ kind: 'Guide', title: g.title, url: docs(g.path), summary: g.summary, keywords: 'docs guide' })),
    { kind: 'Docs', title: 'Documentation', url: NAV.find((i) => i.label === 'Docs')?.href ?? docs(), summary: 'Guides, component pages, and the API reference.', keywords: 'api reference' },
  ];
  return new Response(JSON.stringify(entries), { headers: { 'content-type': 'application/json' } });
}
