// First: partially compiled Angular packages (common, router, platform-browser) need the JIT compiler here.
import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { mergeApplicationConfig, type ApplicationRef } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { SsrApp, ssrConfig } from './ssr/app.js';

// docs/PLAN-R9-ANGULAR.md M6 (D3): the HTML rendered on the server by scripts/angular-ssr.mjs
// is hydrated here; components rendered on the server are re-created in the browser.

let app: ApplicationRef | null = null;

afterEach(() => {
  app?.destroy();
  app = null;
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function serverHtml(): Promise<string> {
  // Written by scripts/angular-ssr.mjs (npm run test:angular) next to the compiled fixture.
  const path = './ssr/server.js';
  const mod: unknown = await import(/* @vite-ignore */ path);
  const html = typeof mod === 'object' && mod !== null && 'default' in mod ? mod.default : undefined;
  if (typeof html !== 'string') throw new Error('Run scripts/angular-ssr.mjs first.');
  return html;
}

/** Put the server-rendered body (app root and hydration state) into this page. */
async function loadServerRender(): Promise<void> {
  const parsed = new DOMParser().parseFromString(await serverHtml(), 'text/html');
  document.body.replaceChildren(...Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true)));
}

async function hydrate(): Promise<ApplicationRef> {
  const config = mergeApplicationConfig(ssrConfig, { providers: [provideClientHydration(), provideLocationMocks()] });
  app = await bootstrapApplication(SsrApp, config);
  await app.whenStable();
  return app;
}

const q = (selector: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
};

const textInput = (): HTMLInputElement => {
  const el = q('aui-text-input input');
  if (!(el instanceof HTMLInputElement)) throw new Error('missing text input');
  return el;
};

describe('SSR + hydration (M6, D3)', () => {
  it('hydrates without mismatches; server-rendered components are re-created once; forms and outputs work', async () => {
    await loadServerRender();
    const serverTitle = q('h1.title');
    const serverSave = q('button.save');
    expect(q('aui-text-input').hasAttribute('data-aui-ssr')).toBe(true);
    expect(textInput().value).toBe('Ada');
    // R16 M3: the server renders the static icon; motion starts only in the browser.
    expect(document.querySelector('aui-icon.spin svg g[data-layer="secondary"]')).not.toBeNull();
    expect(document.querySelector('aui-icon.spin [data-aui-motion]')).toBeNull();
    expect(document.querySelector('aui-icon.spin [data-overlay="lock"]')).not.toBeNull();

    const errors = vi.spyOn(console, 'error');
    const warnings = vi.spyOn(console, 'warn');
    const ref = await hydrate();
    const ngIssues = [...errors.mock.calls, ...warnings.mock.calls].map((args) => args.map(String).join(' ')).filter((m) => /NG0\d{3}|hydration/i.test(m));
    errors.mockRestore();
    warnings.mockRestore();
    expect(ngIssues).toEqual([]);

    // Angular reused the server DOM outside the skipped hosts.
    expect(q('h1.title')).toBe(serverTitle);
    expect(q('button.save')).toBe(serverSave);
    expect(document.querySelectorAll('[data-aui-ssr]')).toHaveLength(0);

    // Re-created exactly once.
    expect(document.querySelectorAll('aui-text-input input')).toHaveLength(1);
    expect(document.querySelectorAll('aui-data-table .cell-name')).toHaveLength(2);
    expect(document.querySelectorAll('aui-card .card-body')).toHaveLength(1);
    expect(document.querySelectorAll('aui-tabs [role="tab"]')).toHaveLength(2);
    expect(document.querySelectorAll('aui-icon > svg')).toHaveLength(2);
    expect(q('aui-icon.spin [data-aui-motion]').getAttribute('data-aui-motion')).toBe('spin');

    // Browser-only directive enhanced after hydration; outputs and projected bindings update.
    expect(serverSave.classList.contains('aui-button--primary')).toBe(true);
    await userEvent.click(serverSave);
    await ref.whenStable();
    expect(serverSave.textContent).toContain('Save 1');
    expect(q('aui-card .card-body').textContent).toBe('Projected 1');

    // Forms: the client control drives the re-created component.
    const input = textInput();
    expect(input.value).toBe('Ada');
    await userEvent.clear(input);
    await userEvent.type(input, 'Grace');
    const root: unknown = ref.components[0]?.instance;
    expect(root instanceof SsrApp && root.name.value).toBe('Grace');
  });

  it('client navigation after hydration: router links, auiRouterNav, and the outlet', async () => {
    await loadServerRender();
    const ref = await hydrate();
    const router = ref.injector.get(Router);
    await userEvent.click(q('aui-sidebar a[data-id="reports"]'));
    await ref.whenStable();
    expect(router.url).toBe('/reports');
    expect(q('aui-sidebar [aria-current="page"]').getAttribute('data-id')).toBe('reports');

    await router.navigateByUrl('/people');
    await ref.whenStable();
    expect(q('aui-sidebar [aria-current="page"]').getAttribute('data-id')).toBe('people');

    await userEvent.click(q('a.to-reports'));
    await ref.whenStable();
    expect(router.url).toBe('/reports');
    expect(document.querySelectorAll('app-page')).toHaveLength(1);
  });
});
