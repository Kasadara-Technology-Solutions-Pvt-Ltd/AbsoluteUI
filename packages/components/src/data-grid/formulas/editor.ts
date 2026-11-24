/**
 * The formula editor (R11-18, G9d): a text field with the APG combobox pattern for function and
 * column names, an argument hint for the function around the caret, a live syntax check, and
 * reference insertion when a cell is clicked (`insertReference`). Keyboard users type references;
 * autocomplete helps (no arrow-key point mode, R11-18).
 */
import { createId } from '@absoluteui/core';
import type { DataGridCellEditor, DataGridEditorContext } from '../editing.js';
import { FormulaSyntaxError, parseFormula } from './parser.js';

export interface FormulaEditorMessages {
  readonly suggestions: string;
  readonly problem: (message: string) => string;
}

export interface FormulaEditorNames {
  /** Function names (upper case) with their signatures (or the name alone). */
  readonly functions: ReadonlyMap<string, string>;
  /** The grid's columns (structured references use the header). */
  readonly columns: readonly { readonly id: string; readonly header: string }[];
}

interface Suggestion {
  readonly label: string;
  readonly insert: string;
  readonly detail: string;
}

/** The name being typed before the caret: a function name or a column reference after `[`. */
function tokenAt(text: string, caret: number): { start: number; kind: 'function' | 'column'; prefix: string } | null {
  const before = text.slice(0, caret);
  if (!before.startsWith('=')) return null;
  // Inside text quotes nothing is suggested.
  if ((before.match(/"/g)?.length ?? 0) % 2 === 1) return null;
  const column = /\[@?([^\]]*)$/.exec(before);
  if (column) return { start: before.length - column[0].length, kind: 'column', prefix: column[0] };
  const name = /(^|[^A-Za-z0-9_.$])([A-Za-z_][A-Za-z0-9_.]*)$/.exec(before.slice(1));
  if (!name?.[2]) return null;
  return { start: before.length - name[2].length, kind: 'function', prefix: name[2] };
}

/** The function call around the caret and the 0-based argument index. */
export function callAt(text: string, caret: number): { name: string; argument: number } | null {
  let depth = 0;
  let argument = 0;
  let quoted = false;
  // Walk back from the caret to the unclosed parenthesis.
  for (let i = caret - 1; i >= 0; i--) {
    const c = text.charAt(i);
    if (c === '"') quoted = !quoted;
    if (quoted) continue;
    if (c === ')') depth++;
    else if (c === '(') {
      if (depth === 0) {
        const name = /([A-Za-z_][A-Za-z0-9_.]*)$/.exec(text.slice(0, i))?.[1];
        return name ? { name: name.toUpperCase(), argument } : null;
      }
      depth--;
    } else if (c === ',' && depth === 0) argument++;
  }
  return null;
}

/** A formula editor for a cell of a `formulas` column. */
export function createFormulaEditor(context: DataGridEditorContext, names: FormulaEditorNames, messages: FormulaEditorMessages): DataGridCellEditor & { insertReference(reference: string): boolean } {
  const { doc } = context;
  const wrapper = doc.createElement('div');
  wrapper.className = 'aui-data-grid__formula-editor';
  const input = doc.createElement('input');
  input.type = 'text';
  input.className = 'aui-data-grid__editor-control aui-data-grid__formula-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-label', context.label);
  const listId = createId('aui-formula-list');
  const hintId = createId('aui-formula-hint');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-describedby', `${context.describedBy} ${hintId}`);
  const list = doc.createElement('ul');
  list.id = listId;
  list.className = 'aui-data-grid__formula-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', messages.suggestions);
  list.hidden = true;
  const hint = doc.createElement('div');
  hint.id = hintId;
  hint.className = 'aui-data-grid__formula-hint';
  wrapper.append(input, hint);
  // The list lives on the body: grid cells clip their content.
  doc.body.append(list);
  // The grid passes the formula, or the value as text.
  const start = context.key ?? (typeof context.value === 'string' ? context.value : '');
  input.value = start;
  let items: Suggestion[] = [];
  let active = -1;
  let checkTimer = 0;
  const view = doc.defaultView ?? window;

  const place = (): void => {
    const r = input.getBoundingClientRect();
    list.style.setProperty('inset-inline-start', `${String(r.left)}px`);
    list.style.setProperty('inset-block-start', `${String(r.bottom + 2)}px`);
    list.style.setProperty('min-inline-size', `${String(Math.max(200, r.width))}px`);
  };
  const close = (): void => {
    list.hidden = true;
    items = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const highlight = (i: number): void => {
    active = i;
    [...list.children].forEach((li, j) => {
      li.setAttribute('aria-selected', String(j === i));
    });
    const li = list.children[i];
    if (li) {
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const accept = (i: number): boolean => {
    const s = items[i];
    const token = tokenAt(input.value, input.selectionStart ?? input.value.length);
    if (!s || !token) return false;
    const caret = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, token.start) + s.insert + input.value.slice(caret);
    const at = token.start + s.insert.length;
    input.setSelectionRange(at, at);
    close();
    update();
    return true;
  };
  const suggest = (): void => {
    const caret = input.selectionStart ?? input.value.length;
    const token = tokenAt(input.value, caret);
    if (!token) {
      close();
      return;
    }
    if (token.kind === 'function') {
      const prefix = token.prefix.toUpperCase();
      items = [...names.functions].filter(([name]) => name.startsWith(prefix) && name !== prefix).slice(0, 12).map(([name, signature]) => ({ label: name, insert: `${name}(`, detail: signature }));
    } else {
      const thisRow = token.prefix.startsWith('[@');
      const prefix = token.prefix.replace(/^\[@?/, '').toLowerCase();
      items = names.columns.filter((c) => c.header.toLowerCase().startsWith(prefix) || c.id.toLowerCase().startsWith(prefix)).slice(0, 12).map((c) => ({ label: c.header, insert: `[${thisRow ? '@' : ''}${c.header}]`, detail: c.id }));
    }
    if (items.length === 0) {
      close();
      return;
    }
    list.replaceChildren(
      ...items.map((s, i) => {
        const li = doc.createElement('li');
        li.id = `${listId}-${String(i)}`;
        li.className = 'aui-data-grid__formula-option';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        const name = doc.createElement('span');
        name.textContent = s.label;
        const detail = doc.createElement('span');
        detail.className = 'aui-data-grid__formula-option-detail';
        detail.textContent = s.detail;
        li.append(name, detail);
        // Pointer choice without taking focus from the field.
        li.addEventListener('mousedown', (event) => {
          event.preventDefault();
          accept(i);
        });
        return li;
      }),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    place();
    highlight(0);
  };
  const describe = (): void => {
    const caret = input.selectionStart ?? input.value.length;
    const call = input.value.startsWith('=') ? callAt(input.value, caret) : null;
    const signature = call ? names.functions.get(call.name) : undefined;
    hint.textContent = signature ?? '';
    hint.classList.remove('aui-data-grid__formula-hint--problem');
    if (checkTimer) view.clearTimeout(checkTimer);
    // The syntax check waits for a pause in typing.
    checkTimer = view.setTimeout(() => {
      checkTimer = 0;
      if (!input.value.startsWith('=') || input.value.length < 2) return;
      try {
        parseFormula(input.value);
      } catch (e) {
        if (!(e instanceof FormulaSyntaxError) || signature) return;
        hint.textContent = messages.problem(`${e.message} (at ${String(e.position + 1)})`);
        hint.classList.add('aui-data-grid__formula-hint--problem');
      }
    }, 400);
  };
  const update = (): void => {
    suggest();
    describe();
  };
  input.addEventListener('input', update);
  input.addEventListener('click', update);
  input.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') describe();
  });
  input.addEventListener('keydown', (event) => {
    if (list.hidden) return;
    const stop = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'ArrowDown') {
      stop();
      highlight((active + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      stop();
      highlight((active - 1 + items.length) % items.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      stop();
      accept(Math.max(0, active));
    } else if (event.key === 'Escape') {
      stop();
      close();
    }
  });
  input.addEventListener('blur', close);

  return {
    element: wrapper,
    control: input,
    getValue: () => input.value,
    focus: () => {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
      describe();
    },
    destroy: () => {
      if (checkTimer) view.clearTimeout(checkTimer);
      list.remove();
    },
    insertReference: (reference) => {
      const caret = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, caret).trimEnd();
      // Only where an operand is expected: after =, an operator, (, comma, or :.
      if (!input.value.startsWith('=') || !/[=+\-*/^&<>(,:]$/.test(before)) return false;
      input.value = input.value.slice(0, caret) + reference + input.value.slice(caret);
      const at = caret + reference.length;
      input.setSelectionRange(at, at);
      update();
      return true;
    },
  };
}
