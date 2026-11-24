// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const links = JSON.parse(readFileSync(new URL('./links.json', import.meta.url), 'utf8'));

// Microsoft Clarity, loaded only after the visitor accepts analytics (MR-8, as R14-7 on the docs site).
const CLARITY = ['https://www.clarity.ms', 'https://scripts.clarity.ms'];

export default defineConfig({
  site: links.site,
  trailingSlash: 'always',
  // No telemetry from the build.
  devToolbar: { enabled: false },
  // Every stylesheet stays a file, so style-src needs no inline source.
  build: { inlineStylesheets: 'never', format: 'directory' },
  security: {
    // Hash-based CSP <meta> on every page. Inline scripts Astro does not bundle (the theme
    // bootstrap) are hashed after the build by scripts/csp-inline.mjs.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://*.clarity.ms https://c.bing.com",
        "connect-src 'self' https://*.clarity.ms",
        "font-src 'self'",
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'self'",
      ],
      scriptDirective: { resources: ["'self'", ...CLARITY] },
    },
  },
  // Code is highlighted by src/lib/shiki.ts (class output); Markdown pages need none.
  // ASCII-only output: no typographic quotes or dashes from SmartyPants.
  markdown: { syntaxHighlight: false, smartypants: false },
  // Fonts and small assets stay files, so font-src needs no data: source.
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
});
