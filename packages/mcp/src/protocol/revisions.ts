/**
 * MCP revisions served (R15-3; facts re-checked 2026-11-24 against modelcontextprotocol.io).
 *
 * - 2026-07-28 (current): stateless. Every request carries `_meta` with the protocol version and the
 *   client capabilities; `server/discover` describes the server; every result carries `resultType`.
 * - 2025-11-25 (legacy): the `initialize` handshake selects legacy behavior for this stdio process.
 */

export const MODERN_REVISION = '2026-07-28';
export const LEGACY_REVISION = '2025-11-25';

/** Versions a stateless request may name in `_meta` (also `data.supported` of -32022 and `supportedVersions`). */
export const STATELESS_VERSIONS: readonly string[] = [MODERN_REVISION];

export const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
export const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

export type Era = 'modern' | 'legacy';

/** Freshness hint on cacheable results: the content never changes while the process runs. */
export const CACHE_TTL_MS = 3_600_000;
