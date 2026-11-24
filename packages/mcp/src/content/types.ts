/**
 * The content snapshot (dist/content.json) written by scripts/build-content.mjs. The loader checks
 * the top-level shape; the build script is the only writer, and check:mcp keeps it fresh.
 */
import type { JsonObject, JsonValue } from '../protocol/jsonrpc.js';

export interface Highlight {
  readonly title: string;
  readonly text: string;
}

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly code: string;
}

export interface DocSection {
  readonly number: number;
  readonly heading: string;
  readonly body: string;
}

export interface ImportCost {
  readonly jsBytes: number;
  readonly jsGzipBytes: number;
  readonly jsBrotliBytes: number;
  readonly cssBrotliBytes: number;
}

export interface ApiOption {
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly default?: JsonValue;
  readonly description?: string;
}

export interface ApiMember {
  readonly name: string;
  readonly signature?: string;
  readonly type?: string;
  readonly detail?: string;
  readonly description?: string;
}

export interface ComponentApi {
  readonly factory: { readonly signature: string };
  readonly configKey?: string;
  readonly options: readonly ApiOption[];
  readonly properties?: readonly ApiMember[];
  readonly methods?: readonly ApiMember[];
  readonly events?: readonly ApiMember[];
  readonly contentAreas?: readonly JsonObject[];
  readonly cssClasses?: readonly JsonObject[];
  readonly iconSlots?: readonly JsonObject[];
}

export interface ComponentEntry {
  readonly name: string;
  readonly displayName: string;
  readonly category: string;
  readonly group: string;
  readonly purpose: string;
  readonly whenToUse: readonly string[];
  readonly whenNotToUse: readonly string[];
  readonly import: string;
  readonly styleImport: string;
  readonly docUrl: string;
  readonly highlights: readonly Highlight[];
  readonly component: JsonObject;
  readonly api: ComponentApi;
  readonly accessibility: JsonObject;
  readonly tokens: readonly string[];
  readonly examples: readonly Example[];
  readonly sections: readonly DocSection[];
  readonly importCost: ImportCost | null;
  readonly showcases: readonly string[];
  readonly angularEntry: string | null;
}

export interface ApiItem {
  readonly module: string;
  readonly kind: string;
  readonly name: string;
  readonly signature: string;
  readonly doc: string;
  readonly deprecated: string | null;
  readonly examples: readonly string[];
}

export interface AddonEntry {
  readonly name: string;
  readonly import: string;
  readonly summary: string;
  readonly docUrl: string;
  readonly markdown: string;
  readonly api: readonly ApiItem[];
}

export interface ShowcaseEntry {
  readonly id: string;
  readonly title: string;
  readonly components: readonly string[];
  readonly code: string;
}

export interface AngularEntry {
  readonly entry: string;
  readonly import: string;
  readonly component: string | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly docUrl: string;
  readonly declarations: readonly JsonObject[];
  readonly examples: readonly { readonly language: string; readonly code: string }[];
}

export interface ApiModule {
  readonly package: string;
  readonly module: string | null;
  readonly import: string;
  readonly summary: string;
  readonly preview: boolean;
  readonly docUrl: string;
  readonly howTo: string;
  readonly items: readonly ApiItem[];
}

export interface GuideEntry {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly docUrl: string;
  readonly markdown: string;
}

export interface ComponentToken {
  readonly name: string;
  readonly cssProperty: string;
  readonly fallback: string;
  readonly kind: string;
  readonly usage: string;
}

export interface Tokens {
  readonly themes: readonly { readonly name: string; readonly mode: string; readonly tokens: Readonly<Record<string, string>> }[];
  readonly densities: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly components: readonly { readonly component: string; readonly tokens: readonly ComponentToken[] }[];
}

export interface IconEntry {
  readonly id: string;
  readonly displayName: string;
  readonly category: string;
  readonly categoryName: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly variants: readonly string[];
  readonly animations: readonly JsonValue[];
  readonly rtl: string;
  readonly exportName: string;
  readonly import: string;
}

export interface Content {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly docsUrl: string;
  readonly components: readonly ComponentEntry[];
  readonly addons: readonly AddonEntry[];
  readonly showcases: readonly ShowcaseEntry[];
  readonly angular: readonly AngularEntry[];
  readonly api: readonly ApiModule[];
  readonly guides: readonly GuideEntry[];
  readonly tokens: Tokens;
  readonly icons: { readonly icons: readonly IconEntry[]; readonly overlays: readonly { readonly id: string; readonly meaning: string; readonly exportName: string }[] };
  readonly schemas: { readonly dashboard: JsonObject };
  readonly excluded: readonly string[];
}
