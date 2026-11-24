// One editable token: a labelled AbsoluteUI text field, plus a native color picker for
// opaque colors. Values are committed on change only when they pass the safe CSS value
// grammar the importer and exporters enforce.
import { TextInput } from '@absoluteui/components/text-input';
import { isSafeTokenValue, parseColor } from '@absoluteui/theme';
import { toHex } from '@absoluteui/theme/designer';
import { button, detail, el, hasValue } from './dom.js';

export interface TokenRowOptions {
  readonly name: string;
  readonly description: string;
  readonly color: boolean;
  /** Empty input means "unset" (component and optional tokens). */
  readonly clearable: boolean;
  readonly placeholder?: string;
  read(): string | undefined;
  write(value: string | null): void;
  /** Extra check (for example keyword values); returns an error message or null. */
  check?(value: string): string | null;
  /** When present, a Reset button restores the derived value. */
  reset?(): void;
  isOverridden?(): boolean;
}

export interface TokenRow {
  readonly element: HTMLElement;
  refresh(): void;
  focus(): void;
}

export function tokenRow(o: TokenRowOptions): TokenRow {
  const row = el('div', { className: 'td-token', attrs: { 'data-token': o.name } });
  const field = el('div', { className: 'td-token__field' });
  const input = TextInput.create(field, {
    label: o.name,
    description: o.description,
    value: o.read() ?? '',
    placeholder: o.placeholder ?? '',
    spellcheck: false,
    autocomplete: 'off',
  });
  row.append(field);
  let picker: HTMLInputElement | null = null;
  if (o.color) {
    picker = el('input', { className: 'td-token__picker', attrs: { type: 'color', 'aria-label': `${o.name} color picker` } });
    picker.addEventListener('change', () => {
      if (picker) o.write(picker.value.toUpperCase());
    });
    row.append(picker);
  }
  const status = el('span', { className: 'td-token__status' });
  row.append(status);
  let resetButton: HTMLButtonElement | null = null;
  if (o.reset) {
    resetButton = button(row, 'Use derived', { variant: 'ghost', size: 'sm', label: `Use the value derived from the seeds for ${o.name}` }, () => {
      o.reset?.();
    }).element;
  }

  input.host.addEventListener('aui-change', (event) => {
    const d = detail(event, hasValue);
    if (!d) return;
    const value = d.value.trim();
    if (value === '' && o.clearable) {
      input.setCustomError(null);
      o.write(null);
      return;
    }
    const problem = value === '' ? 'Enter a value.' : !isSafeTokenValue(value) ? 'Use a plain CSS value: colors, lengths, numbers, font stacks, shadows, or cubic-bezier(). url(), braces, and semicolons are not allowed.' : (o.check?.(value) ?? null);
    input.setCustomError(problem);
    input.reportValidity();
    if (!problem) o.write(value);
  });

  const refresh = (): void => {
    const value = o.read() ?? '';
    const focused = row.contains(document.activeElement) && document.activeElement !== picker;
    if (!focused) input.setValue(value);
    const rgb = parseColor(value);
    if (picker) {
      picker.hidden = !rgb || rgb.a < 1;
      if (rgb?.a === 1) picker.value = toHex(rgb).toLowerCase();
    }
    const overridden = o.isOverridden?.() ?? false;
    status.textContent = overridden ? 'Differs from the seeds' : o.clearable && value === '' ? 'Unset' : '';
    if (resetButton) resetButton.hidden = !overridden;
  };
  refresh();
  return {
    element: row,
    refresh,
    focus: () => {
      input.focus();
    },
  };
}
