/**
 * Definition history (R18-14): each step stores the JSON Patch forward and back, not full snapshots,
 * so 100 steps of a large dashboard stay small. Covers every definition change: moves, resizes, add,
 * remove, and widget or source configuration.
 */
import { applyJsonPatch, createJsonPatch, type JsonPatchOperation } from '@absoluteui/helpers/json';

interface Step {
  readonly forward: readonly JsonPatchOperation[];
  readonly back: readonly JsonPatchOperation[];
}

export class DefinitionHistory {
  readonly #limit: number;
  #undo: Step[] = [];
  #redo: Step[] = [];

  constructor(limit = 100) {
    this.#limit = Math.max(1, Math.min(1000, Math.floor(limit)));
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  record(before: unknown, after: unknown): void {
    const forward = createJsonPatch(before, after);
    if (forward.length === 0) return;
    this.#undo.push({ forward, back: createJsonPatch(after, before) });
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo = [];
  }

  /** Returns the previous document, or undefined when there is nothing to undo. */
  undo(current: unknown): unknown {
    const step = this.#undo.pop();
    if (!step) return undefined;
    this.#redo.push(step);
    return applyJsonPatch(structuredClone(current), step.back);
  }

  redo(current: unknown): unknown {
    const step = this.#redo.pop();
    if (!step) return undefined;
    this.#undo.push(step);
    return applyJsonPatch(structuredClone(current), step.forward);
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }
}
