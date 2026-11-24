---
title: AI assistants (MCP)
description: Give AI coding assistants exact AbsoluteUI knowledge and code checks with the local MCP server, or point them at llms.txt.
---

AI coding assistants write better AbsoluteUI code when they look things up instead of guessing option, event, or method names. AbsoluteUI offers two ways to give them that knowledge:

- **`@absoluteui/mcp`**, a local [Model Context Protocol](https://modelcontextprotocol.io) server. Assistants that support MCP (Claude Code, VS Code, and others) can search the docs, read component references, and check their own code against this version of AbsoluteUI.
- **`llms.txt`**, a plain index of these docs at [https://aui.kasadara.com/llms.txt](https://aui.kasadara.com/llms.txt), with the full text in [`llms-full.txt`](https://aui.kasadara.com/llms-full.txt), for assistants without MCP.

`@absoluteui/mcp` is published with the other packages since 0.13.0.

## What the server does

The server runs on your machine and talks to the assistant over stdio. It answers from a copy of these docs that is built into the package, so the answers always match the version you install.

| Tool | What it answers |
|---|---|
| `search_docs` | Ranked search over components, package APIs, Angular bindings, guides, design tokens, and icons. |
| `list_components` | Every component by group, or the components of one group with their purpose and imports. |
| `get_component` | One component's reference: overview, options, methods, events, keyboard, accessibility, behavior, performance, tokens, CSS hooks, security, limitations, and TypeScript definitions. |
| `get_examples` | Type-checked examples, the Angular example, or the fully featured showcase of a component. |
| `get_api` | The API of `@absoluteui/core`, `utilities`, `helpers`, `theme`, `icons`, or `services` (preview), down to one symbol. |
| `get_angular` | An `@absoluteui/angular` entry point: selector, inputs, models, outputs, and forms integration. |
| `get_guide` | A guide or getting-started page, whole or by section. |
| `get_tokens` | Design tokens with their values in each built-in theme, and each component's own tokens. |
| `search_icons` | Icons of the AbsoluteUI icon set by meaning or alias, with their imports. |
| `get_setup` | Installation and setup for TypeScript or Angular. |
| `validate_usage` | Checks a TypeScript or Angular snippet: entry points, stylesheets, option, event, and method names, accessible names, Angular selectors, inputs, and outputs, HTML-string APIs that break the Content Security Policy, and third-party icons. |
| `get_schema` | The JSON Schema of a dashboard definition. |
| `validate_dashboard` | Checks a dashboard definition with the same checker the Dashboard component uses. |

It also offers the same content as `absoluteui://` resources and six prompts: `build_form`, `add_data_grid`, `build_dashboard`, `choose_component`, `review_accessibility`, and `theme_app`.

`validate_usage` does not type-check. After it, run your project's own `tsc --noEmit` (or `ng build` for Angular), which checks your code against the types of the installed packages.

## Set up

Install the server as a development dependency, at the same version as your other `@absoluteui/*` packages:

```sh
npm install --save-dev @absoluteui/mcp
```

Then register it with your assistant. The command is the same everywhere: `npx absoluteui-mcp`, which runs the copy in your project.

**Claude Code.** Run this in the project root; it writes `.mcp.json`, which you can commit so the whole team gets the server:

```sh
claude mcp add --transport stdio --scope project absoluteui -- npx absoluteui-mcp
```

**VS Code.** Add the server to `.vscode/mcp.json`:

```json
{
  "servers": {
    "absoluteui": { "type": "stdio", "command": "npx", "args": ["absoluteui-mcp"] }
  }
}
```

**Other assistants.** Add a stdio MCP server with the command `npx` and the argument `absoluteui-mcp`, as described in your assistant's documentation.

## Security and privacy

- **Local only.** The server is a process on your machine. It makes no network requests and sends no telemetry.
- **Read-only.** Every tool only reads. None writes files, runs code, or changes anything. Snippets and definitions you check are analyzed in memory and never stored or logged.
- **No access to your project.** The server reads only its own package files. It never opens a path the assistant names.
- **No third-party code.** The package has no dependencies; the protocol layer, search, and validation are part of AbsoluteUI.
- **Diagnostics.** Set `ABSOLUTEUI_MCP_DEBUG=1` to write diagnostics to stderr. They never include your code.

## Protocol support

The server implements MCP revision 2026-07-28 and also accepts clients that still use revision 2025-11-25 (with the `initialize` handshake). It needs Node.js 22.22.3 or later in the 22 line, or 24.15.0 or later.
