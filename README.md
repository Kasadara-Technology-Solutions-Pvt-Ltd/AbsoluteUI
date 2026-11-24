# AbsoluteUI

AbsoluteUI is an enterprise UI component library for web applications. It provides accessible, themeable components (forms, date and time pickers, data tables and an enterprise data grid, charts, dashboards, scheduling, Kanban, and Gantt) that work in any framework or none, with a native Angular integration.

- **Framework-neutral**: components are TypeScript controllers that render into elements you own, shipped as minified ES modules.
- **Accessible**: WAI-ARIA patterns throughout, tested against WCAG 2.2 AA in default, dark, and high-contrast themes.
- **Secure by default**: runs under a strict Content Security Policy with Trusted Types; HTML is sanitized.
- **Zero runtime dependencies**: no third-party code ships with the packages.
- **Business-ready dates**: time zones, recurrence rules, fiscal periods, and business calendars (weekends, holidays, business days) built in.
- **Themeable**: design tokens, component tokens, and a Theme Designer for building and checking your own themes.

Full documentation, with guides, API reference, and live examples: [aui.kasadara.com/docs](https://aui.kasadara.com/docs/).

## Packages

| Package | What it is |
|---|---|
| [`@absoluteui/components`](packages/components/README.md) | The UI components |
| [`@absoluteui/angular`](packages/angular/README.md) | The components for Angular |
| [`@absoluteui/theme`](packages/theme/README.md) | Themes, design tokens, and the Theme Designer engine |
| [`@absoluteui/core`](packages/core/README.md) | Configuration, dates and time zones, recurrence, internationalization, sanitization |
| [`@absoluteui/helpers`](packages/helpers/README.md) | Pure helper functions for browsers and Node.js |
| [`@absoluteui/utilities`](packages/utilities/README.md) | Focus, keyboard, overlay, and positioning primitives |
| [`@absoluteui/icons`](packages/icons/README.md) | Icon set and icon registry |
| [`@absoluteui/mcp`](packages/mcp/README.md) | MCP server that gives AI coding assistants the AbsoluteUI documentation and checks ([guide](https://aui.kasadara.com/docs/guides/ai-assistants/)) |

## Building from source

Requires Node.js 22.22.3 or later in the 22 line, or 24.15.0 or later.

```sh
npm ci
npm run build
npm test
```

`npm run verify` runs every check, including the browser tests; install the Playwright browsers first with `npx playwright install`.

## License

Copyright (c) 2026 Kasadara Technology Solutions Pvt Ltd. Licensed under the [Apache License 2.0](LICENSE); see also [NOTICE](NOTICE). AbsoluteUI is Kasadara's contribution to the open-source community; the source is at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI. Bug reports and feature requests are welcome; external code contributions are not accepted. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
