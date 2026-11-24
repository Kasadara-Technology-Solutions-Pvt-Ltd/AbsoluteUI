# @absoluteui/mcp

A local, read-only [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI coding assistants exact AbsoluteUI knowledge of this version (components, APIs, Angular bindings, guides, design tokens, icons) and checks their code. It runs on your machine over stdio: no network access, no telemetry, and it never reads your project files.

## Set up

Install it next to the other AbsoluteUI packages, at the same version:

```sh
npm install --save-dev @absoluteui/mcp
```

Claude Code (writes `.mcp.json` at the project root):

```sh
claude mcp add --transport stdio --scope project absoluteui -- npx absoluteui-mcp
```

VS Code (`.vscode/mcp.json`):

```json
{ "servers": { "absoluteui": { "type": "stdio", "command": "npx", "args": ["absoluteui-mcp"] } } }
```

Any other MCP client: a stdio server with the command `npx` and the argument `absoluteui-mcp`.

## What's in the package

- **Tools**: `search_docs`, `list_components`, `get_component`, `get_examples`, `get_api`, `get_angular`, `get_guide`, `get_tokens`, `search_icons`, `get_setup`, `validate_usage`, `get_schema`, `validate_dashboard`.
- **Resources**: `absoluteui://components`, `absoluteui://tokens`, `absoluteui://icons`, `absoluteui://schema/dashboard`, `absoluteui://llms.txt`, `absoluteui://component/{name}`, `absoluteui://component/{name}/metadata/{file}`, `absoluteui://api/{package}/{module}`, `absoluteui://angular/{entry}`, `absoluteui://guide/{+slug}`.
- **Prompts**: `build_form`, `add_data_grid`, `build_dashboard`, `choose_component`, `review_accessibility`, `theme_app`.

## Requirements

Node.js 22.22.3 or later in the 22 line, or 24.15.0 or later. MCP specification revisions 2026-07-28 and 2025-11-25.

## Documentation

Full documentation: [aui.kasadara.com/docs/guides/ai-assistants/](https://aui.kasadara.com/docs/guides/ai-assistants/)

## License

Licensed under the [Apache License 2.0](https://aui.kasadara.com/license/). Copyright (c) 2026 Kasadara Technology Solutions Pvt Ltd; see the LICENSE and NOTICE files in this package. AbsoluteUI is open source, Kasadara's contribution to the open-source community; the source is at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI. Report vulnerabilities as described in the [Security Policy](https://aui.kasadara.com/security/).
