/**
 * Tracks the classes and custom properties a helper added to a consumer-owned
 * element, so `destroy()` restores exactly what was there before. Classes in the
 * same family (for example gap modifiers) are mutually exclusive: choosing one
 * removes the others, and pre-existing members are put back on restore.
 */
export class AppliedStyles {
  readonly #el: HTMLElement;
  readonly #added = new Set<string>();
  readonly #displaced = new Set<string>();
  readonly #props = new Map<string, { value: string; priority: string }>();

  constructor(el: HTMLElement) {
    this.#el = el;
  }

  /** Make `chosen` the only class of `members` present on the element (`null` removes them all). */
  setClass(members: readonly string[], chosen: string | null): void {
    const list = this.#el.classList;
    for (const m of members) {
      if (m === chosen || !list.contains(m)) continue;
      list.remove(m);
      if (this.#added.has(m)) this.#added.delete(m);
      else this.#displaced.add(m);
    }
    if (chosen === null || list.contains(chosen)) return;
    list.add(chosen);
    if (this.#displaced.has(chosen)) this.#displaced.delete(chosen);
    else this.#added.add(chosen);
  }

  /** Set a custom property through the CSSOM (CSP-safe); `null` restores the previous value. */
  setProperty(name: string, value: string | null): void {
    const style = this.#el.style;
    if (value === null) {
      this.#restoreProperty(name);
      return;
    }
    if (!this.#props.has(name)) this.#props.set(name, { value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) });
    style.setProperty(name, value);
  }

  /** Remove everything this tracker added and put back what it displaced. */
  restore(): void {
    for (const c of this.#added) this.#el.classList.remove(c);
    for (const c of this.#displaced) this.#el.classList.add(c);
    this.#added.clear();
    this.#displaced.clear();
    for (const name of [...this.#props.keys()]) this.#restoreProperty(name);
  }

  #restoreProperty(name: string): void {
    const previous = this.#props.get(name);
    if (!previous) return;
    this.#props.delete(name);
    if (previous.value === '') this.#el.style.removeProperty(name);
    else this.#el.style.setProperty(name, previous.value, previous.priority);
  }
}
