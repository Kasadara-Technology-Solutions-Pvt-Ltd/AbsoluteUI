/**
 * Our own BM25 search (R15-9) over components, API modules, Angular entries, guides, tokens, and icons,
 * with field boosts. Built lazily on the first search; input is tokenized, never turned into a regular
 * expression.
 */
import type { Content } from './types.js';
import { stringOf } from '../protocol/jsonrpc.js';

export const SEARCH_KINDS = ['component', 'api', 'angular', 'guide', 'token', 'icon'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchHit {
  readonly kind: SearchKind;
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly uri: string;
  readonly docUrl: string;
  readonly score: number;
}

interface Field {
  readonly text: string;
  readonly boost: number;
}

interface Doc {
  readonly hit: Omit<SearchHit, 'score'>;
  readonly terms: ReadonlyMap<string, number>;
  readonly length: number;
}

const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'use', 'with', 'what', 'when', 'which', 'you', 'your']);
const K1 = 1.2;
const B = 0.75;
const MAX_QUERY_TERMS = 32;

function stem(term: string): string {
  if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1);
  return term;
}

/** Lower-cased terms; camelCase and kebab-case words also yield their parts. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[^A-Za-z0-9]+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (!STOP.has(lower)) out.push(stem(lower));
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])/);
    if (parts.length > 1) for (const p of parts) if (p.length > 1 && !STOP.has(p.toLowerCase())) out.push(stem(p.toLowerCase()));
  }
  return out;
}

function makeDoc(hit: Omit<SearchHit, 'score'>, fields: readonly Field[]): Doc {
  const terms = new Map<string, number>();
  let length = 0;
  for (const field of fields) {
    for (const term of tokenize(field.text)) {
      terms.set(term, (terms.get(term) ?? 0) + field.boost);
      length += 1;
    }
  }
  return { hit, terms, length: Math.max(length, 1) };
}

const BODY_CHARS = 6_000;

function documents(content: Content): Doc[] {
  const docs: Doc[] = [];
  for (const c of content.components) {
    const names = [...c.api.options, ...(c.api.methods ?? []), ...(c.api.events ?? []), ...(c.api.properties ?? [])].map((m) => m.name).join(' ');
    const body = c.sections.map((s) => `${s.heading} ${s.body}`).join(' ').slice(0, BODY_CHARS);
    docs.push(makeDoc(
      { kind: 'component', id: c.name, title: c.displayName, summary: c.purpose, uri: `absoluteui://component/${c.name}`, docUrl: c.docUrl },
      [
        { text: `${c.displayName} ${c.name}`, boost: 4 },
        { text: `${c.group} ${c.category} ${c.whenToUse.join(' ')} ${c.highlights.map((h) => `${h.title} ${h.text}`).join(' ')}`, boost: 2 },
        { text: `${c.purpose} ${names}`, boost: 1.5 },
        { text: body, boost: 1 },
      ],
    ));
  }
  for (const a of content.addons) {
    docs.push(makeDoc(
      { kind: 'component', id: a.name, title: a.name, summary: a.summary, uri: `absoluteui://component/${a.name}`, docUrl: a.docUrl },
      [{ text: a.name, boost: 4 }, { text: a.summary, boost: 2 }, { text: a.api.map((i) => i.name).join(' '), boost: 1.5 }, { text: a.markdown.slice(0, BODY_CHARS), boost: 1 }],
    ));
  }
  for (const m of content.api) {
    const id = m.module === null ? m.package : `${m.package}/${m.module}`;
    docs.push(makeDoc(
      { kind: 'api', id, title: m.import, summary: m.preview ? `Preview. ${m.summary}` : m.summary, uri: `absoluteui://api/${m.package}/${m.module ?? 'index'}`, docUrl: m.docUrl },
      [
        { text: `${m.import} ${m.module ?? m.package}`, boost: 4 },
        { text: `${m.summary} ${m.items.map((i) => i.name).join(' ')}`, boost: 2 },
        { text: `${m.items.map((i) => i.doc).join(' ')} ${m.howTo}`.slice(0, BODY_CHARS), boost: 1 },
      ],
    ));
  }
  for (const e of content.angular) {
    const names = e.declarations.map((d) => `${stringOf(d.name)} ${stringOf(d.selector)}`).join(' ');
    const title = e.title ?? e.import;
    docs.push(makeDoc(
      { kind: 'angular', id: e.entry, title, summary: e.summary ?? `Angular binding of ${e.component ?? e.entry}.`, uri: `absoluteui://angular/${e.entry}`, docUrl: e.docUrl },
      [{ text: `${e.entry} ${e.import} angular`, boost: 3 }, { text: names, boost: 2 }, { text: e.summary ?? '', boost: 1 }],
    ));
  }
  for (const g of content.guides) {
    docs.push(makeDoc(
      { kind: 'guide', id: g.slug, title: g.title, summary: g.description, uri: `absoluteui://guide/${g.slug}`, docUrl: g.docUrl },
      [{ text: g.title, boost: 4 }, { text: `${g.description} ${(g.markdown.match(/^#{2,3} .+$/gm) ?? []).join(' ')}`, boost: 2 }, { text: g.markdown.slice(0, BODY_CHARS), boost: 1 }],
    ));
  }
  for (const group of content.tokens.components) {
    docs.push(makeDoc(
      { kind: 'token', id: group.component, title: `${group.component} tokens`, summary: `${group.tokens.length} component tokens (--aui-${group.component}-*).`, uri: 'absoluteui://tokens', docUrl: `${content.docsUrl}/guides/theming/` },
      [{ text: `${group.component} tokens theme`, boost: 3 }, { text: group.tokens.map((t) => `${t.name} ${t.usage}`).join(' '), boost: 1 }],
    ));
  }
  for (const i of content.icons.icons) {
    docs.push(makeDoc(
      { kind: 'icon', id: i.id, title: i.displayName, summary: i.description, uri: 'absoluteui://icons', docUrl: `${content.docsUrl}/guides/icons/` },
      [{ text: `${i.id} ${i.displayName} ${i.aliases.join(' ')}`, boost: 4 }, { text: `${i.categoryName} ${i.description}`, boost: 1.5 }],
    ));
  }
  return docs;
}

export interface SearchIndex {
  readonly search: (query: string, options?: { readonly kinds?: readonly SearchKind[]; readonly limit?: number }) => SearchHit[];
}

export function createSearchIndex(content: Content): SearchIndex {
  let docs: Doc[] | undefined;
  let df: Map<string, number> | undefined;
  let avgLength = 1;
  const ensure = (): { docs: Doc[]; df: Map<string, number> } => {
    if (!docs || !df) {
      docs = documents(content);
      df = new Map();
      for (const d of docs) for (const term of d.terms.keys()) df.set(term, (df.get(term) ?? 0) + 1);
      avgLength = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1);
    }
    return { docs, df };
  };
  return {
    search: (query, options = {}) => {
      const index = ensure();
      const terms = [...new Set(tokenize(query))].slice(0, MAX_QUERY_TERMS);
      if (terms.length === 0) return [];
      const kinds = options.kinds && options.kinds.length > 0 ? new Set(options.kinds) : null;
      const total = index.docs.length;
      const scored: SearchHit[] = [];
      for (const d of index.docs) {
        if (kinds && !kinds.has(d.hit.kind)) continue;
        let score = 0;
        for (const term of terms) {
          const tf = d.terms.get(term);
          if (!tf) continue;
          const n = index.df.get(term) ?? 0;
          const idf = Math.log(1 + (total - n + 0.5) / (n + 0.5));
          score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.length) / avgLength));
        }
        if (score > 0) scored.push({ ...d.hit, score: Math.round(score * 1000) / 1000 });
      }
      scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      return scored.slice(0, options.limit ?? 10);
    },
  };
}
