# Official MCP schemas (test fixtures only)

Vendored for the protocol tests (docs/PLAN-R15-MCP.md section 7). Never shipped: `packages/mcp` publishes only `dist`.

| File | Source | SHA-256 |
|---|---|---|
| `2026-07-28.schema.json` | https://raw.githubusercontent.com/modelcontextprotocol/specification/main/schema/2026-07-28/schema.json | `907dcebce6aaeb16c21421ffef8c207093d88b9442fee340658a99cacb06b551` |
| `2025-11-25.schema.json` | https://raw.githubusercontent.com/modelcontextprotocol/specification/main/schema/2025-11-25/schema.json | `268a5f82ba70fd7e4b6dc4aa1e64f116f74b4d0edcb69dc046829c79dd4e97e7` |

Downloaded 2026-11-24 with the user's approval, from `main` at commit `b0be8f0f2481`. The license is the upstream repository's. To refresh: download again, update the hashes and the commit, and run `npm run test:mcp`.
