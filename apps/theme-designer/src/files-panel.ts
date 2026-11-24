// Export and import (SPEC section 10.6, section 10.7). Exports always carry the compliance result;
// a non-compliant theme says so next to every export button. Imports are validated
// against the versioned schema and every problem is listed with its JSON path.
import { Alert } from '@absoluteui/components/alert';
import { TextInput } from '@absoluteui/components/text-input';
import { MAX_IMPORT_BYTES, importTheme, toCss, toDtcg, toFontsCss, toPackageZip, toScss, toThemeJson, toTypeScript, type ComplianceReport } from '@absoluteui/theme/designer';
import type { DesignerContext } from './context.js';
import { announce, button, detail, download, el, hasValue, host } from './dom.js';

export function filesPanel(parent: HTMLElement, ctx: DesignerContext): { setReport(report: ComplianceReport): void } {
  parent.append(el('h3', { className: 'td-subheading', text: 'Export' }));
  const disclosure = el('p', { className: 'td-disclosure', attrs: { 'aria-live': 'polite' } });
  parent.append(disclosure);
  const f = (): string => `${ctx.store.family.name}-${ctx.store.family.version}`;
  const run = (label: string, action: () => void): void => {
    try {
      action();
      announce(`${label} downloaded.`);
    } catch (e) {
      announce(`${label} failed: ${e instanceof Error ? e.message : 'unknown error'}.`);
    }
  };
  const grid = el('div', { className: 'td-export' });
  parent.append(grid);
  const exports: readonly { label: string; hint: string; act: () => void }[] = [
    { label: 'Theme JSON', hint: 'AbsoluteUI theme family, schema 2; re-import to keep editing.', act: () => { download(`${f()}.theme.json`, toThemeJson(ctx.store.family), 'application/json'); } },
    { label: 'CSS custom properties', hint: 'All modes, the system theme, densities, and responsive values.', act: () => { download(`${f()}.css`, toCss(ctx.store.family), 'text/css'); } },
    { label: 'Web font loader', hint: 'fonts.css: @import rules for the web fonts (opt in; lists the CSP hosts).', act: () => { download(`${f()}.fonts.css`, toFontsCss(ctx.store.family), 'text/css'); } },
    { label: 'SCSS maps', hint: 'Token maps per mode, densities, and breakpoints.', act: () => { download(`_${ctx.store.family.name}.scss`, toScss(ctx.store.family), 'text/x-scss'); } },
    { label: 'TypeScript', hint: 'Typed family plus a register function for applyTheme().', act: () => { download(`${ctx.store.family.name}-theme.ts`, toTypeScript(ctx.store.family), 'text/plain'); } },
    ...(['light', 'dark', 'high-contrast'] as const).map((m) => ({
      label: `Design tokens (DTCG, ${m})`,
      hint: 'Design Tokens Format Module 2025.10.',
      act: () => { download(`${f()}.${m}.tokens.json`, toDtcg(ctx.store.family, m), 'application/design-tokens+json'); },
    })),
  ];
  for (const x of exports) {
    const cell = el('div', { className: 'td-export__item' });
    button(cell, x.label, { variant: 'secondary', size: 'sm' }, () => {
      run(x.label, x.act);
    });
    cell.append(el('span', { className: 'td-hint', text: x.hint }));
    grid.append(cell);
  }

  parent.append(el('h4', { className: 'td-subheading', text: 'Versioned package' }));
  const pkgForm = el('div', { className: 'td-inline-form' });
  parent.append(pkgForm);
  let packageName = '';
  let license = 'UNLICENSED';
  const nameInput = TextInput.create(host(pkgForm), { label: 'Package name', placeholder: `absoluteui-theme-${ctx.store.family.name}`, spellcheck: false, autocomplete: 'off' });
  const licenseInput = TextInput.create(host(pkgForm), { label: 'License (SPDX)', value: license, spellcheck: false, autocomplete: 'off' });
  nameInput.host.addEventListener('aui-input', (e) => {
    packageName = detail(e, hasValue)?.value.trim() ?? '';
  });
  licenseInput.host.addEventListener('aui-input', (e) => {
    license = detail(e, hasValue)?.value.trim() ?? '';
  });
  button(pkgForm, 'Download package (.zip)', { variant: 'primary' }, () => {
    try {
      const zip = toPackageZip(ctx.store.family, { ...(packageName ? { packageName } : {}), license: license || 'UNLICENSED' });
      nameInput.setCustomError(null);
      download(`${f()}.zip`, zip, 'application/zip');
      announce('Package downloaded.');
    } catch (e) {
      nameInput.setCustomError(e instanceof TypeError ? e.message : 'Could not build the package.');
      nameInput.reportValidity();
    }
  });
  parent.append(el('p', { className: 'td-hint', text: 'The package contains theme.css, fonts.css, _theme.scss, theme.json, DTCG tokens per mode, an ES module with types, README.md, and COMPLIANCE.json.' }));

  parent.append(el('h3', { className: 'td-subheading', text: 'Import' }));
  const file = el('input', { className: 'td-visually-hidden', id: 'import-file', attrs: { type: 'file', accept: '.json,application/json', 'aria-label': 'Theme file' } });
  parent.append(file);
  const importRow = el('div', { className: 'td-row' });
  parent.append(importRow);
  button(importRow, 'Import theme file', { variant: 'secondary' }, () => {
    file.click();
  });
  importRow.append(el('span', { className: 'td-hint', text: 'Theme JSON (schema 1 or 2) or @absoluteui/theme tokens.json.' }));
  const result = host(parent);
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    result.replaceChildren();
    if (chosen.size > MAX_IMPORT_BYTES) {
      Alert.create(host(result), { tone: 'error', title: 'File too large', message: `Theme files are limited to ${String(MAX_IMPORT_BYTES / 1_000_000)} MB.`, live: 'polite' });
      return;
    }
    void chosen.text().then((text) => {
      const r = importTheme(text);
      if (!r.ok) {
        const items = el('ul', { className: 'td-list' }, ...r.errors.map((e) => el('li', { text: `${e.path || '(file)'}: ${e.message}` })));
        Alert.create(host(result), { tone: 'error', title: `Not imported: ${String(r.errors.length)} problem${r.errors.length === 1 ? '' : 's'}`, message: items, live: 'polite' });
        return;
      }
      ctx.store.set(r.family, 'import');
      Alert.create(host(result), {
        tone: r.warnings.length ? 'warning' : 'success',
        title: `Imported ${r.family.name} ${r.family.version}`,
        message: r.warnings.length ? r.warnings.join(' ') : 'Undo restores the previous theme.',
        live: 'polite',
        dismissible: true,
      });
    });
  });

  return {
    setReport(report) {
      disclosure.textContent = report.compliant
        ? 'This theme meets the token-level baseline. Exports include the compliance report.'
        : 'This theme is not compliant. Exports are allowed, but the package README and COMPLIANCE.json record the failures; do not present it as accessible.';
      disclosure.classList.toggle('td-disclosure--fail', !report.compliant);
    },
  };
}
