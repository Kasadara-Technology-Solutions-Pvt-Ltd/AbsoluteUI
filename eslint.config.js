// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import regexpPlugin from 'eslint-plugin-regexp';

/** CSP and XSS engineering rules (SPEC section 14.6.1). */
const cspRestrictedSyntax = [
  {
    selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
    message: 'CSP/XSS (SPEC section 14.6.1): build DOM with createElement/textContent or use the sanitization engine.',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'CSP/XSS (SPEC section 14.6.1): insertAdjacentHTML is forbidden.',
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: 'CSP/XSS (SPEC section 14.6.1): document.write is forbidden.',
  },
  {
    selector: "CallExpression[callee.property.name=/^(setAttribute|setAttributeNS)$/] > Literal.arguments:first-child[value='style']",
    message: 'CSP (SPEC section 14.6.1): use element.style.setProperty() instead of a style attribute.',
  },
  {
    selector: "CallExpression[callee.property.name=/^(setAttribute|setAttributeNS)$/] > Literal.arguments:first-child[value=/^on/i]",
    message: 'CSP (SPEC section 14.6.1): inline event handler attributes are forbidden; use addEventListener.',
  },
  {
    selector: "CallExpression[callee.property.name='createElement'] > Literal.arguments:first-child[value=/^(style|script)$/i]",
    message: 'CSP (SPEC section 14.6.1): injected <style>/<script> elements are forbidden; use compiled CSS or adoptedStyleSheets.',
  },
  {
    selector: "CallExpression[callee.name=/^(setTimeout|setInterval)$/] > Literal.arguments:first-child",
    message: 'CSP (SPEC section 14.6.1): string-based timers are forbidden.',
  },
];

/** Package dependency direction (SPEC section 4.3). */
const boundary = (/** @type {string} */ pkg, /** @type {string[]} */ allowed) => ({
  files: [`packages/${pkg}/src/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@absoluteui/*', ...allowed.map((a) => `!@absoluteui/${a}`)],
            message: `@absoluteui/${pkg} may only import: ${allowed.length ? allowed.join(', ') : 'nothing from other AbsoluteUI packages'}.`,
          },
          { group: ['../../*/src/*', '../../../*/src/*'], message: 'Import other packages by package name, not relative path.' },
          { group: ['@angular/*', 'react', 'react-dom', 'react-dom/*', 'vue'], message: 'Framework-neutral packages must not import a framework (docs/PLAN-R9-ANGULAR.md M0).' },
        ],
      },
    ],
  },
});

export default defineConfig(
  globalIgnores(['**/dist/**', 'node_modules/**', '.claude/**', '.cache/**', '.private-sourcemaps/**', 'test-results/**', 'playwright-report/**', 'tests/e2e/.out/**', 'apps/preview/.out/**', 'apps/theme-designer/.out/**', '.vitest/**', 'apps/site/public/examples/**', 'apps/site/.astro/**', 'apps/site/src/generated/**', 'apps/site/src/content.config.ts', 'apps/demo-hrms/.out/**', 'apps/marketing/dist/**', 'apps/marketing/.astro/**', 'apps/marketing/public/frames/**', 'apps/marketing/frames/blocks/angular/**', 'apps/marketing/src/generated/**', 'apps/marketing/src/site.ts', 'apps/marketing/src/pages/*.ts', 'apps/pilot-angular/.angular/**', 'apps/site/.cache/**']),
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-restricted-syntax': ['error', ...cspRestrictedSyntax],
      'no-eval': 'error',
      'no-implied-eval': 'off',
      '@typescript-eslint/no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Analytics consent loaders (R14-7): after consent they add one external Clarity <script>
    // whose host the page CSP allows; every other CSP rule still applies.
    files: ['apps/site/src/scripts/consent.ts', 'apps/marketing/src/lib/consent.ts', 'apps/theme-designer/src/consent.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...cspRestrictedSyntax.filter((r) => !r.selector.includes("'createElement'"))],
    },
  },
  {
    // ASCII-only text in library source (docs/PLAN-ASCII.md P6): non-ASCII characters in
    // strings and templates must be written as \u escapes (they stay functional data).
    files: ['packages/*/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...cspRestrictedSyntax,
        { selector: 'Literal[raw=/[^\\x00-\\x7e]/]', message: 'Write non-ASCII characters as \\u escapes (docs/PLAN-ASCII.md P6).' },
        { selector: 'TemplateElement[value.raw=/[^\\x00-\\x7e]/]', message: 'Write non-ASCII characters as \\u escapes (docs/PLAN-ASCII.md P6).' },
      ],
    },
  },
  boundary('helpers', []),
  boundary('services', ['helpers']),
  {
    // R5 helpers/services (docs/PLAN-HELPERS.md §5): ReDoS-safe regular expressions, no Math.random.
    files: ['packages/helpers/src/**/*.ts', 'packages/services/src/**/*.ts'],
    extends: [regexpPlugin.configs['flat/recommended']],
    rules: {
      'regexp/no-super-linear-backtracking': 'error',
      'regexp/no-super-linear-move': 'error',
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use crypto-backed helpers from @absoluteui/helpers/random (docs/PLAN-HELPERS.md §5).' }],
    },
  },
  boundary('core', ['helpers']),
  boundary('utilities', ['core']),
  boundary('theme', ['core']),
  boundary('icons', ['core']),
  boundary('components', ['helpers', 'core', 'utilities', 'theme', 'icons']),
  // R15-15: the MCP server bundles DOM-free first-party code from components at build time.
  boundary('mcp', ['components']),
  // Framework adapters bind public component subpaths only (SPEC section 22: never reimplement logic).
  // Angular components and directives are decorated classes that may have no members (style-only components).
  { files: ['packages/angular/src/**/*.ts'], rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] } },
  ...['angular', 'react', 'vue'].map((adapter) => ({
    files: [`packages/${adapter}/src/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@absoluteui/*', '!@absoluteui/core', '!@absoluteui/theme', '!@absoluteui/icons', '!@absoluteui/utilities', '!@absoluteui/components', '@absoluteui/components/*/*', '../../components/*', '../../../*/src/*'],
              message: `@absoluteui/${adapter} may only import @absoluteui/core, @absoluteui/theme, @absoluteui/icons, @absoluteui/utilities, and public @absoluteui/components/<name> subpaths.`,
            },
          ],
        },
      ],
    },
  })),
  {
    files: ['packages/*/test/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'packages/mcp/scripts/*.mjs', 'tests/e2e/*.mjs', 'apps/theme-designer/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  {
    // Documentation site build scripts (R4 phase A) run in Node.
    files: ['apps/site/scripts/**/*.mjs', 'apps/site/astro.config.mjs', 'apps/demo-hrms/scripts/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' } },
  },
  {
    // Marketing site build, capture, and check scripts (R4 phase C) run in Node; the
    // browser globals are used inside Playwright page.evaluate callbacks.
    files: ['apps/marketing/scripts/**/*.mjs', 'apps/marketing/astro.config.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly', fetch: 'readonly', AbortSignal: 'readonly', setTimeout: 'readonly', document: 'readonly', getComputedStyle: 'readonly', innerHeight: 'readonly', innerWidth: 'readonly', scrollTo: 'readonly', HTMLScriptElement: 'readonly' },
    },
  },
  {
    // The demo server (R4 phase B) logs to stdout.
    files: ['apps/demo-hrms/server/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // R9 M7 pilot: its own tsconfig (bundler resolution, Angular decorators).
    files: ['apps/pilot-angular/src/**/*.ts'],
    languageOptions: { parserOptions: { project: './apps/pilot-angular/tsconfig.app.json', tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Angular's static Validators (Validators.required, ...) are designed to be passed unbound.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['apps/pilot-angular/src/main.ts', 'apps/pilot-angular/src/server.ts'],
    rules: { 'no-console': 'off' },
  },
);
