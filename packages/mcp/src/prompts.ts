/**
 * Prompt templates (docs/PLAN-R15-MCP.md section 4.4). They only assemble text and point at tools and
 * resources; they call nothing.
 */
import type { PromptDefinition } from './surface.js';
import type { Content } from './content/types.js';

const FRAMEWORK = { name: 'framework', description: '"ts" (framework-neutral TypeScript) or "angular".', required: true } as const;
const frameworkOf = (value: string | undefined): 'angular' | 'ts' => (value?.trim().toLowerCase() === 'angular' ? 'angular' : 'ts');
const completeFramework = (argument: string, value: string): readonly string[] => (argument === 'framework' ? ['ts', 'angular'].filter((f) => f.startsWith(value.toLowerCase())) : []);

function message(text: string): { readonly description: string; readonly messages: readonly [{ readonly role: 'user'; readonly content: { readonly type: 'text'; readonly text: string } }] } {
  return { description: text.split('\n')[0] ?? '', messages: [{ role: 'user', content: { type: 'text', text } }] };
}

const RULES = [
  'Rules: import each component from its own entry point and load its style.css and the theme;',
  'give every control its visible label (its accessible name); never build HTML strings;',
  'use icons from the AbsoluteUI icon set (search_icons); check the result with validate_usage, then run tsc.',
].join(' ');

export function prompts(content: Content): PromptDefinition[] {
  const angularNote = (framework: 'angular' | 'ts'): string =>
    framework === 'angular'
      ? 'Use the @absoluteui/angular components (get_angular for each: selector, inputs, outputs, forms integration) with Angular reactive forms. Read absoluteui://guide/angular/guides/forms.'
      : 'Use the framework-neutral components (get_component and get_examples for each). Read absoluteui://guide/guides/forms.';
  return [
    {
      name: 'build_form',
      title: 'Build an accessible form',
      description: 'An accessible AbsoluteUI form with fitting field controls, validation, and an error summary.',
      arguments: [{ name: 'fields', description: 'The fields the form needs, in plain words (names, types, rules).', required: true }, FRAMEWORK],
      complete: completeFramework,
      get: (args) => {
        const framework = frameworkOf(args.framework);
        return message(
          [
            `Build an accessible form with AbsoluteUI ${content.version} for these fields:`,
            args.fields ?? '',
            '',
            'Use Form to coordinate validation, Form Field or each control\'s own label, and Error Summary on submit. Pick each control with search_docs and get_component (date fields: Date Picker or Date Input with business-calendar rules where weekends or holidays matter).',
            'If the fields come from a JSON Schema, use Schema Form (get_component schema-form) instead of building each control.',
            angularNote(framework),
            RULES,
          ].join('\n'),
        );
      },
    },
    {
      name: 'add_data_grid',
      title: 'Add a Data Grid',
      description: 'A Data Grid with the right entry points, add-ons, and styles for the data and features described.',
      arguments: [{ name: 'data', description: 'The rows and columns, in plain words or as a sample.', required: true }, { name: 'features', description: 'Features such as sorting, filtering, editing, grouping, export, or server data.', required: false }],
      get: (args) =>
        message(
          [
            `Add an AbsoluteUI ${content.version} Data Grid for this data:`,
            args.data ?? '',
            args.features ? `Features: ${args.features}` : 'Features: sorting and filtering.',
            '',
            'Read get_component data-grid (sections overview, options, events, performance) and absoluteui://guide/guides/data-grid. Add-ons are separate entry points (data-grid-editors, data-grid-accessories, data-grid-export, data-grid-pdf, data-grid-formulas, data-grid-charts, data-grid-schema): import only those the features need. For a simple read-only table, consider Data Table instead.',
            RULES,
          ].join('\n'),
        ),
    },
    {
      name: 'build_dashboard',
      title: 'Build a dashboard',
      description: 'A configurable dashboard definition checked with validate_dashboard, plus the host code.',
      arguments: [{ name: 'goal', description: 'What the dashboard shows and for whom.', required: true }, FRAMEWORK],
      complete: completeFramework,
      get: (args) => {
        const framework = frameworkOf(args.framework);
        return message(
          [
            `Design an AbsoluteUI ${content.version} dashboard for: ${args.goal ?? ''}`,
            '',
            'Write the dashboard definition as JSON that conforms to get_schema name "dashboard" (widgets, layout, data sources, variables). Check it with validate_dashboard and fix every issue before showing it.',
            framework === 'angular' ? 'Host it with <aui-dashboard> (get_angular dashboard).' : 'Host it with Dashboard.create (get_component dashboard, get_examples dashboard).',
            'Data sources are fetched by the application at run time; never embed credentials in the definition.',
            RULES,
          ].join('\n'),
        );
      },
    },
    {
      name: 'choose_component',
      title: 'Choose a component',
      description: 'Pick the smallest fitting AbsoluteUI component for a need, with reasons.',
      arguments: [{ name: 'need', description: 'What the UI must let users do.', required: true }],
      get: (args) =>
        message(
          [
            `Which AbsoluteUI ${content.version} component fits this need best?`,
            args.need ?? '',
            '',
            'Search with search_docs (kinds: component), then compare the candidates\' "when to use" and "when not to use" (get_component, section overview). Recommend the smallest component that covers the need, say why the others fit less well, and give its import and stylesheet. Mention limitations that matter (get_component, section limitations).',
          ].join('\n'),
        ),
    },
    {
      name: 'review_accessibility',
      title: 'Review accessibility',
      description: "Review code against the AbsoluteUI components' keyboard and ARIA contracts.",
      arguments: [{ name: 'code', description: 'The code to review.', required: true }],
      get: (args) =>
        message(
          [
            `Review this code for accessibility with AbsoluteUI ${content.version}:`,
            '```',
            args.code ?? '',
            '```',
            '',
            'Run validate_usage first. For each AbsoluteUI component used, read get_component with sections keyboard and accessibility, and check: an accessible name for every control, no keyboard traps, focus moved and restored for overlays, errors announced and linked, and color never the only signal. Report each problem with the WCAG criterion, the line, and the fix.',
          ].join('\n'),
        ),
    },
    {
      name: 'theme_app',
      title: 'Theme an application',
      description: 'A custom AbsoluteUI theme from brand colors, including chart colors.',
      arguments: [{ name: 'brand', description: 'Brand colors and any font or shape preferences.', required: true }],
      get: (args) =>
        message(
          [
            `Create an AbsoluteUI ${content.version} theme for this brand: ${args.brand ?? ''}`,
            '',
            'Read absoluteui://guide/guides/theming and get_tokens (overview, then groups such as color, and the chart component tokens). Derive the role tokens from the brand colors, keep text and non-text contrast at WCAG 2.2 AA in light, dark, and high-contrast modes, and set chart series colors (--aui-chart-*) that stay distinguishable. Use the Theme Designer engine API (get_api theme, module designer) to check compliance.',
          ].join('\n'),
        ),
    },
  ];
}
