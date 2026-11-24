// Legal consistency gate (docs/decisions/legal-pages.md): legal.json is the single source for
// company, contact, and legal-page details. The license, the policies, the package banner
// settings, and the Theme Designer footer must agree with it. The docs and marketing sites read
// legal.json at build time; their own output checks verify the footer links.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadLegal, notices, pagePaths, root } from './legal.mjs';

const legal = loadLegal();
const errors = [];
const read = (file) => readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d)} ${MONTHS[m - 1]} ${String(y)}`;
};
const need = (file, text, what) => {
  if (!read(file).includes(text)) errors.push(`${file}: missing ${what} (${text})`);
};

// Documents: title, effective date, company, and contact.
for (const [file, doc] of Object.entries(legal.documents)) {
  need(file, `# ${doc.title}\n`, 'title');
  if (doc.effective) need(file, `**Effective date:** ${longDate(doc.effective)}`, 'effective date');
  if (doc.version) need(file, `**Version ${doc.version}**`, 'version');
  need(file, legal.company, 'company name');
}
for (const file of ['PRIVACY.md', 'TERMS.md', 'SECURITY.md']) need(file, legal.address.replace(/, India$/, ''), 'registered address');
need('PRIVACY.md', legal.emails.legal, 'privacy contact');
need('TERMS.md', legal.emails.legal, 'legal contact');
need('SECURITY.md', legal.emails.security, 'security contact');
// The license is the unmodified Apache License 2.0; NOTICE carries the copyright and attribution.
if (!/^\s*Apache License\s+Version 2\.0, January 2004\s/.test(read('LICENSE'))) errors.push('LICENSE: not the Apache License 2.0 text');
need('NOTICE', `Copyright ${legal.copyrightYear} ${legal.company}`, 'copyright line');

// Every storage item a site uses is listed in the Privacy Policy.
for (const item of legal.storage) for (const key of item.key.split(', ')) need('PRIVACY.md', `\`${key}\``, `storage item for ${item.site}`);

// Package banners (scripts/lib.mjs banner()) use release.config.json.
const release = JSON.parse(read('release.config.json'));
if (release.licensor !== legal.company) errors.push(`release.config.json: licensor "${release.licensor}" differs from legal.json company`);
if (release.licenseUrl !== legal.pages.license) errors.push(`release.config.json: licenseUrl ${release.licenseUrl} differs from legal.json pages.license`);
if (release.licenseName !== legal.license.spdx) errors.push('release.config.json: licenseName differs from legal.json license.spdx');

// Theme Designer footer (static HTML): copyright and every legal link.
const designer = read('apps/theme-designer/index.html');
if (!designer.includes(`(c) ${legal.copyrightYear} ${legal.company}.`)) errors.push('apps/theme-designer/index.html: footer copyright differs from legal.json');
// One website (docs/PLAN-ONE-SITE.md OS-11): the designer links the root legal pages by path.
const paths = pagePaths(legal);
for (const key of ['license', 'privacy', 'terms', 'security', 'notices']) if (!designer.includes(`href="${paths[key]}"`)) errors.push(`apps/theme-designer/index.html: footer has no link to ${paths[key]}`);

// Third-party notices resolve to installed packages with license texts.
const listed = notices(legal);

if (errors.length) {
  console.error(`check:legal: ${String(errors.length)} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check:legal: ok (${String(Object.keys(legal.documents).length)} documents, ${String(legal.storage.length)} storage items, ${String(listed.length)} notices)`);
