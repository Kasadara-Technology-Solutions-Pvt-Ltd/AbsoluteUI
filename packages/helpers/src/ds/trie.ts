interface TrieNode<V> {
  children: Map<string, TrieNode<V>> | undefined;
  /** Stored key (original spelling) and value when a key ends here. */
  entry: { key: string; value: V } | undefined;
  /** Number of keys in this subtree, for O(1) prefix counts. */
  count: number;
}

export interface TrieOptions {
  /** Fold case for matching (`'default'` uses `toLowerCase`; a locale uses `toLocaleLowerCase`). Default: exact. */
  readonly caseFold?: boolean | string;
}

const newNode = <V>(): TrieNode<V> => ({ children: undefined, entry: undefined, count: 0 });

/**
 * Prefix tree mapping string keys to values. Walks by code point (surrogate-pair safe); every
 * operation is iterative, so very long keys cannot overflow the stack.
 * Complexity (m = key length, k = results): `set`, `get`, `has`, `delete`, `hasPrefix`, `countPrefix` O(m);
 * `entriesWithPrefix` O(m + subtree size) with children visited in code-unit order.
 * @example
 * const t = new TrieMap<number>(undefined, { caseFold: true });
 * t.set('Apple', 1).set('apricot', 2);
 * t.get('APPLE');              // => 1
 * t.keysWithPrefix('ap');      // => ['Apple', 'apricot']
 */
export class TrieMap<V> implements Iterable<[string, V]> {
  #root: TrieNode<V> = newNode();
  readonly #fold: (s: string) => string;

  constructor(entries?: Iterable<readonly [string, V]>, options: TrieOptions = {}) {
    const f = options.caseFold;
    this.#fold = f === undefined || f === false ? (s) => s : f === true ? (s) => s.toLowerCase() : (s) => s.toLocaleLowerCase(f);
    if (entries) for (const [k, v] of entries) this.set(k, v);
  }

  /** Number of keys. O(1). */
  get size(): number {
    return this.#root.count;
  }

  /** Inserts or replaces `key`. The latest spelling is kept when case folding. O(m). */
  set(key: string, value: V): this {
    const path: TrieNode<V>[] = [this.#root];
    let n = this.#root;
    for (const ch of this.#fold(key)) {
      n.children ??= new Map();
      let next = n.children.get(ch);
      if (!next) {
        next = newNode();
        n.children.set(ch, next);
      }
      n = next;
      path.push(n);
    }
    const added = n.entry === undefined;
    n.entry = { key, value };
    if (added) for (const p of path) p.count++;
    return this;
  }

  /** Value for `key`. O(m). */
  get(key: string): V | undefined {
    return this.#find(this.#fold(key))?.entry?.value;
  }

  /** True when `key` is stored. O(m). */
  has(key: string): boolean {
    return this.#find(this.#fold(key))?.entry !== undefined;
  }

  /** Removes `key`, pruning empty branches. O(m). */
  delete(key: string): boolean {
    const path: [TrieNode<V>, string][] = [];
    let n: TrieNode<V> | undefined = this.#root;
    for (const ch of this.#fold(key)) {
      const next: TrieNode<V> | undefined = n.children?.get(ch);
      if (!next) return false;
      path.push([n, ch]);
      n = next;
    }
    if (n.entry === undefined) return false;
    n.entry = undefined;
    for (const [p] of path) p.count--;
    n.count--;
    // Prune childless, entry-less nodes bottom-up.
    for (const [parent, ch] of path.reverse()) {
      const child = parent.children?.get(ch);
      if (!child || child.count > 0) break;
      parent.children?.delete(ch);
      if (parent.children?.size === 0) parent.children = undefined;
    }
    return true;
  }

  /** True when any key starts with `prefix` (the empty prefix matches any non-empty trie). O(m). */
  hasPrefix(prefix: string): boolean {
    return (this.#find(this.#fold(prefix))?.count ?? 0) > 0;
  }

  /** Number of keys starting with `prefix`. O(m). */
  countPrefix(prefix: string): number {
    return this.#find(this.#fold(prefix))?.count ?? 0;
  }

  /** Entries whose key starts with `prefix`, in code-unit order, at most `limit`. */
  entriesWithPrefix(prefix: string, limit = Infinity): [string, V][] {
    const out: [string, V][] = [];
    const start = this.#find(this.#fold(prefix));
    if (!start || limit <= 0) return out;
    const stack: TrieNode<V>[] = [start];
    for (let n = stack.pop(); n; n = stack.pop()) {
      if (n.entry) {
        out.push([n.entry.key, n.entry.value]);
        if (out.length >= limit) break;
      }
      if (n.children) {
        const keys = [...n.children.keys()].sort().reverse();
        for (const key of keys) {
          const child = n.children.get(key);
          if (child) stack.push(child);
        }
      }
    }
    return out;
  }

  /** Keys starting with `prefix`, in code-unit order, at most `limit`. */
  keysWithPrefix(prefix: string, limit = Infinity): string[] {
    return this.entriesWithPrefix(prefix, limit).map(([k]) => k);
  }

  /** Longest prefix shared by every stored key (folded form). O(length of the prefix). */
  longestCommonPrefix(): string {
    if (this.#root.count === 0) return '';
    let out = '';
    let n = this.#root;
    while (!n.entry && n.children?.size === 1) {
      const first = n.children.entries().next();
      if (first.done) break;
      const [ch, next] = first.value;
      out += ch;
      n = next;
    }
    return out;
  }

  /** Longest stored key that is a prefix of `text` (tokenizers, routing). O(length of text). */
  longestPrefixOf(text: string): string | undefined {
    let n: TrieNode<V> | undefined = this.#root;
    let best = n.entry?.key;
    for (const ch of this.#fold(text)) {
      n = n.children?.get(ch);
      if (!n) break;
      if (n.entry) best = n.entry.key;
    }
    return best;
  }

  /** Removes every key. */
  clear(): void {
    this.#root = newNode();
  }

  /** All entries in code-unit order. O(n). */
  toArray(): [string, V][] {
    return this.entriesWithPrefix('');
  }

  /** Iterates all entries in code-unit order. */
  [Symbol.iterator](): Iterator<[string, V]> {
    return this.toArray()[Symbol.iterator]();
  }

  #find(folded: string): TrieNode<V> | undefined {
    let n: TrieNode<V> | undefined = this.#root;
    for (const ch of folded) {
      n = n.children?.get(ch);
      if (!n) return undefined;
    }
    return n;
  }
}

/**
 * Set of strings as a prefix tree (autocomplete, prefix checks).
 * Complexity as `TrieMap`.
 * @example
 * const t = new Trie(['car', 'cart', 'cat']);
 * t.startsWith('ca');       // => true
 * t.findByPrefix('car');    // => ['car', 'cart']
 * t.longestCommonPrefix();  // => 'ca'
 */
export class Trie implements Iterable<string> {
  readonly #map: TrieMap<true>;

  constructor(words?: Iterable<string>, options: TrieOptions = {}) {
    this.#map = new TrieMap<true>(undefined, options);
    if (words) for (const w of words) this.#map.set(w, true);
  }

  /** Number of words. O(1). */
  get size(): number {
    return this.#map.size;
  }

  /** Adds `word`. O(m). */
  insert(word: string): this {
    this.#map.set(word, true);
    return this;
  }

  /** True when `word` is stored. O(m). */
  has(word: string): boolean {
    return this.#map.has(word);
  }

  /** Removes `word`. O(m). */
  delete(word: string): boolean {
    return this.#map.delete(word);
  }

  /** True when any word starts with `prefix`. O(m). */
  startsWith(prefix: string): boolean {
    return this.#map.hasPrefix(prefix);
  }

  /** Words starting with `prefix` in code-unit order, at most `limit`. */
  findByPrefix(prefix: string, limit = Infinity): string[] {
    return this.#map.keysWithPrefix(prefix, limit);
  }

  /** Number of words starting with `prefix`. O(m). */
  countPrefix(prefix: string): number {
    return this.#map.countPrefix(prefix);
  }

  /** Longest prefix shared by every word. */
  longestCommonPrefix(): string {
    return this.#map.longestCommonPrefix();
  }

  /** Longest stored word that prefixes `text`. */
  longestPrefixOf(text: string): string | undefined {
    return this.#map.longestPrefixOf(text);
  }

  /** Removes every word. */
  clear(): void {
    this.#map.clear();
  }

  /** Words in code-unit order. */
  toArray(): string[] {
    return this.#map.keysWithPrefix('');
  }

  /** Iterates words in code-unit order. */
  [Symbol.iterator](): Iterator<string> {
    return this.toArray()[Symbol.iterator]();
  }
}
