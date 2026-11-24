// Shared legal data for the docs site, the marketing site, and the Theme Designer
// (docs/decisions/legal-pages.md): company and contact details, page URLs, third-party notices
// read from the installed packages' own license files, and security.txt (RFC 9116).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** legal.json, the single source for company, contact, and legal-page details. */
export function loadLegal() {
  return JSON.parse(readFileSync(join(root, 'legal.json'), 'utf8'));
}

/**
 * Legal-page URLs as root-relative paths (`/privacy/`), for links inside the one website
 * (docs/PLAN-ONE-SITE.md OS-11): they work on every host that serves it. Package banners and
 * other documents keep the absolute URLs of legal.json.
 */
export function pagePaths(legal = loadLegal()) {
  return Object.fromEntries(Object.entries(legal.pages).map(([key, url]) => [key, new URL(url).pathname]));
}

/** Third-party notices: each listed package with its version, SPDX license, and full license text. */
export function notices(legal = loadLegal()) {
  return legal.notices.map((n) => {
    const dir = join(root, 'node_modules', ...n.package.split('/'));
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const file = join(dir, ...(n.licenseFile ?? 'LICENSE').split('/'));
    if (!existsSync(file)) throw new Error(`legal: no license file for ${n.package} (${file})`);
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    return {
      name: n.name,
      package: n.package,
      version: pkg.version,
      license: pkg.license,
      sites: n.sites,
      note: n.note ?? '',
      homepage: pkg.homepage ?? (repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '') : ''),
      text: readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim(),
    };
  });
}

/** security.txt (RFC 9116) for one site. Expires is set 364 days after the build, so a redeploy renews it. */
export function securityTxt(site, now = new Date(), legal = loadLegal()) {
  const expires = new Date(now.getTime() + 364 * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: mailto:${legal.emails.security}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en',
    `Policy: ${legal.pages.security}`,
    `Canonical: ${legal.sites[site]}/.well-known/security.txt`,
    '',
  ].join('\n');
}
