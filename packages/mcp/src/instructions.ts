/** Server instructions (docs/PLAN-R15-MCP.md section 4.1): short and stable. */
export const INSTRUCTIONS = (version: string): string =>
  [
    `AbsoluteUI ${version}: framework-neutral Web Components (TypeScript, ES modules) with an Angular integration (@absoluteui/angular).`,
    'Before writing AbsoluteUI code, look it up here: search_docs, then get_component, get_examples, get_api, or get_angular. Do not guess option, event, or method names.',
    'Import each component from its own entry point (@absoluteui/components/<name>) and load its style.css plus the theme (@absoluteui/theme/absolute-default.css).',
    'Give every component its accessible label. Never build HTML strings or use innerHTML; components render their own DOM under a strict Content Security Policy.',
    'Prefer the original AbsoluteUI icon set (search_icons); third-party icons work only through an icon adapter.',
    'Check code with validate_usage and dashboard definitions with validate_dashboard; then run the project\'s own tsc.',
    `Install the same version (${version}) of every @absoluteui/* package. React and Vue adapters are not available.`,
  ].join(' ');
