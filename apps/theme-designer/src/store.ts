// Designer state: the theme family under edit, with undo/redo. Seeds drive derivation;
// tokens the author changed by hand stay overridden when seeds change. A draft is kept in
// localStorage for convenience only (the exported files are the durable output).
import type { ThemeMode, TokenMap } from '@absoluteui/theme';
import { omit } from './dom.js';
import { assertValidFamily, builtInFamily, deriveMode, familyModes, importThemeValue, overriddenTokens, type ThemeFamily } from '@absoluteui/theme/designer';

const DRAFT_KEY = 'aui-theme-designer-draft';
const HISTORY_LIMIT = 100;

export type Listener = (family: ThemeFamily, reason: string) => void;

export class Store {
  #family: ThemeFamily;
  readonly #undo: ThemeFamily[] = [];
  readonly #redo: ThemeFamily[] = [];
  readonly #listeners = new Set<Listener>();

  constructor(initial: ThemeFamily) {
    this.#family = initial;
  }

  get family(): ThemeFamily {
    return this.#family;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Replace the family (validated first), recording an undo step. */
  set(next: ThemeFamily, reason: string): void {
    const valid = assertValidFamily(next);
    this.#undo.push(this.#family);
    if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
    this.#redo.length = 0;
    this.#family = valid;
    this.#emit(reason);
  }

  undo(): void {
    const prev = this.#undo.pop();
    if (!prev) return;
    this.#redo.push(this.#family);
    this.#family = prev;
    this.#emit('undo');
  }

  redo(): void {
    const next = this.#redo.pop();
    if (!next) return;
    this.#undo.push(this.#family);
    this.#family = next;
    this.#emit('redo');
  }

  #emit(reason: string): void {
    saveDraft(this.#family);
    for (const l of this.#listeners) l(this.#family, reason);
  }
}

/** Set one global token in one mode (or clear an optional token with `null`). */
export function withToken(family: ThemeFamily, mode: ThemeMode, name: string, value: string | null): ThemeFamily {
  const tokens = value === null ? omit(family.modes[mode].tokens, name) : { ...family.modes[mode].tokens, [name]: value };
  return { ...family, modes: { ...family.modes, [mode]: { ...family.modes[mode], tokens } } };
}

/** Set (or unset with `null`) one component token in one mode. */
export function withComponentToken(family: ThemeFamily, mode: ThemeMode, name: string, value: string | null): ThemeFamily {
  const componentTokens = value === null ? omit(family.modes[mode].componentTokens, name) : { ...family.modes[mode].componentTokens, [name]: value };
  return { ...family, modes: { ...family.modes, [mode]: { ...family.modes[mode], componentTokens } } };
}

/** Non-color tokens of the light mode: the shared foundation derivation starts from. */
export function foundationOf(family: ThemeFamily): TokenMap {
  return Object.fromEntries(Object.entries(family.modes.light.tokens).filter(([k]) => !k.startsWith('color-') && !k.startsWith('scrollbar-')));
}

/**
 * Change seeds and re-derive every mode. With `keepOverrides`, tokens that differed from
 * the old derivation (manual overrides) keep their values; everything else follows the
 * new seeds. Without it, every derived token is replaced (a fresh derivation).
 */
export function withSeeds(family: ThemeFamily, seeds: TokenMap, keepOverrides = true): ThemeFamily {
  const modes = { ...family.modes };
  for (const mode of familyModes) {
    const kept = new Set(keepOverrides ? overriddenTokens(family, mode) : []);
    const derived = deriveMode(seeds, mode, foundationOf(family));
    const current = family.modes[mode].tokens;
    const tokens: Record<string, string> = { ...derived };
    for (const name of Object.keys(current)) {
      const v = current[name];
      if (v !== undefined && (kept.has(name) || !(name in derived))) tokens[name] = v;
    }
    modes[mode] = { ...family.modes[mode], tokens };
  }
  return { ...family, seeds: { ...seeds }, modes };
}

/** Reset one token of one mode to what the seeds derive. */
export function resetToDerived(family: ThemeFamily, mode: ThemeMode, name: string): ThemeFamily {
  const derived = deriveMode(family.seeds, mode, foundationOf(family))[name];
  return derived === undefined ? family : withToken(family, mode, name, derived);
}

export function loadDraft(): ThemeFamily {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const result = importThemeValue(JSON.parse(raw));
      if (result.ok) return result.family;
    }
  } catch {
    // Storage may be unavailable (private mode, blocked site data); start fresh.
  }
  return builtInFamily();
}

function saveDraft(family: ThemeFamily): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(family));
  } catch {
    // Best effort only.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Best effort only.
  }
}
