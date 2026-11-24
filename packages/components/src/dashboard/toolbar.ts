/**
 * Dashboard Toolbar (R18-10, SPEC 18.17): variable controls (S1), refresh, the view/edit switch (R18-9),
 * and in edit mode undo, redo, reset, add widget, and JSON. Built from AbsoluteUI controls only.
 */
import { DisposableGroup, getCommonConfig, getMessage, parsePlainDate, plainDateToString, registerMessages, type Direction } from '@absoluteui/core';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { Button } from '../button/button.js';
import { DateRangePicker } from '../date-range-picker/date-range-picker.js';
import { MultiSelect } from '../multi-select/multi-select.js';
import { NumberInput } from '../number-input/number-input.js';
import { Select } from '../select/select.js';
import { Switch } from '../switch/switch.js';
import { TextInput } from '../text-input/text-input.js';
import type { VariableDefinition } from './definition.js';
import type { DateRange, VariableValue } from './variables.js';

/** Which toolbar items to show. Every item defaults to true; `edit`, `undo`, `reset`, `add`, and `json` need `editable`. */
export interface DashboardToolbarOptions {
  readonly variables?: boolean;
  readonly refresh?: boolean;
  readonly edit?: boolean;
  readonly undo?: boolean;
  readonly reset?: boolean;
  readonly add?: boolean;
  readonly json?: boolean;
  readonly pages?: boolean;
}

registerMessages('dashboardToolbar', 'en', {
  label: '{title} controls',
  refresh: 'Refresh',
  edit: 'Edit dashboard',
  undo: 'Undo',
  redo: 'Redo',
  reset: 'Reset',
  add: 'Add widget',
  json: 'JSON',
});

/** The dashboard surface the toolbar drives (kept narrow so the toolbar is testable on its own). */
export interface ToolbarTarget {
  readonly host: HTMLElement;
  readonly title: string;
  readonly variables: readonly VariableDefinition[];
  values(): Readonly<Record<string, VariableValue>>;
  setVariable(id: string, value: unknown): boolean;
  readonly editable: boolean;
  mode(): 'view' | 'edit';
  setMode(mode: 'view' | 'edit'): void;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  reset(): void;
  isDirty(): boolean;
  refresh(): void;
  /** Present once the builder is available (D4). */
  openBuilder?: (() => void) | undefined;
  openJson?: (() => void) | undefined;
  calendar(name: string | undefined): BusinessCalendarEngine | undefined;
  readonly locale: string | undefined;
  readonly direction: Direction | undefined;
}

interface Destroyable {
  destroy(): void;
}

export class DashboardToolbar {
  readonly element: HTMLDivElement;
  readonly #target: ToolbarTarget;
  readonly #options: DashboardToolbarOptions;
  readonly #group = new DisposableGroup();
  readonly #controls: Destroyable[] = [];
  #editSwitch: Switch | null = null;
  #undo: Button | null = null;
  #redo: Button | null = null;
  #reset: Button | null = null;
  readonly #editItems: HTMLElement[] = [];

  constructor(target: ToolbarTarget, options: DashboardToolbarOptions = {}) {
    this.#target = target;
    this.#options = options;
    const doc = target.host.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'aui-dashboard-toolbar';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', this.#msg('label', { title: target.title }));
    this.#build();
    this.sync();
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('dashboardToolbar', key, params, this.#target.locale ?? getCommonConfig().locale);
  }

  #common(): { locale?: string; direction?: Direction } {
    return { ...(this.#target.locale === undefined ? {} : { locale: this.#target.locale }), ...(this.#target.direction === undefined ? {} : { direction: this.#target.direction }) };
  }

  #build(): void {
    const doc = this.element.ownerDocument;
    const o = this.#options;
    const t = this.#target;
    if (o.variables !== false && t.variables.length > 0) {
      const vars = doc.createElement('div');
      vars.className = 'aui-dashboard-toolbar__variables';
      for (const v of t.variables) vars.append(this.#variableControl(v));
      this.element.append(vars);
    }
    const actions = doc.createElement('div');
    actions.className = 'aui-dashboard-toolbar__actions';
    this.element.append(actions);
    const button = (key: string, icon: string, onClick: () => void, edit: boolean): Button => {
      const b = Button.create({ text: this.#msg(key), icon, variant: 'ghost', size: 'sm' }, doc);
      b.element.classList.add('aui-dashboard-toolbar__button');
      b.element.addEventListener('click', onClick);
      actions.append(b.element);
      this.#controls.push(b);
      if (edit) this.#editItems.push(b.element);
      return b;
    };
    if (o.refresh !== false) button('refresh', 'refresh', () => { t.refresh(); }, false);
    if (t.editable) {
      if (o.undo !== false) {
        this.#undo = button('undo', 'undo', () => { t.undo(); }, true);
        this.#redo = button('redo', 'redo', () => { t.redo(); }, true);
      }
      if (o.reset !== false) this.#reset = button('reset', 'close', () => { t.reset(); }, true);
      if (o.add !== false && t.openBuilder) button('add', 'plus', () => t.openBuilder?.(), true);
      if (o.json !== false && t.openJson) button('json', 'code', () => t.openJson?.(), true);
      if (o.edit !== false) {
        const host = doc.createElement('div');
        host.className = 'aui-dashboard-toolbar__edit';
        actions.append(host);
        this.#editSwitch = Switch.create(host, { label: this.#msg('edit'), checked: t.mode() === 'edit', ...(this.#target.locale === undefined ? {} : { locale: this.#target.locale }) });
        this.#controls.push(this.#editSwitch);
        this.#group.listen(host, 'aui-change' as keyof HTMLElementEventMap, (e) => {
          t.setMode((e as CustomEvent<{ checked: boolean }>).detail.checked ? 'edit' : 'view');
        });
      }
    }
  }

  #variableControl(v: VariableDefinition): HTMLElement {
    const doc = this.element.ownerDocument;
    const host = doc.createElement('div');
    host.className = 'aui-dashboard-toolbar__variable';
    host.dataset.auiVariable = v.id;
    const value = this.#target.values()[v.id];
    const on = (handler: (detail: unknown) => void): void => {
      this.#group.listen(host, 'aui-change' as keyof HTMLElementEventMap, (e) => {
        handler((e as CustomEvent<unknown>).detail);
      });
    };
    switch (v.kind) {
      case 'dateRange': {
        const range = value as DateRange | null | undefined;
        const start = range ? parsePlainDate(range.from) : null;
        const end = range ? parsePlainDate(range.to) : null;
        const calendar = this.#target.calendar(v.businessCalendar);
        this.#controls.push(DateRangePicker.create(host, { label: v.label, value: start && end ? { start, end } : null, ...(calendar ? { businessCalendar: calendar } : {}), ...this.#common() }));
        on((d) => {
          const r = (d as { value: { start: Parameters<typeof plainDateToString>[0]; end: Parameters<typeof plainDateToString>[0] } | null }).value;
          if (r) this.#target.setVariable(v.id, { from: plainDateToString(r.start), to: plainDateToString(r.end) });
        });
        break;
      }
      case 'select':
        if (v.multiple === true) {
          this.#controls.push(MultiSelect.create(host, { label: v.label, options: v.options, value: Array.isArray(value) ? (value as readonly string[]) : [], ...(this.#target.locale === undefined ? {} : { locale: this.#target.locale }) }));
          on((d) => this.#target.setVariable(v.id, (d as { value: readonly string[] }).value));
        } else {
          this.#controls.push(Select.create(host, { label: v.label, options: v.options, value: typeof value === 'string' ? value : null, ...this.#common() }));
          on((d) => this.#target.setVariable(v.id, (d as { value: string | null }).value));
        }
        break;
      case 'text':
        this.#controls.push(TextInput.create(host, { label: v.label, value: typeof value === 'string' ? value : '', ...(v.maxLength === undefined ? {} : { maxLength: v.maxLength }) }));
        on((d) => this.#target.setVariable(v.id, (d as { value: string }).value));
        break;
      case 'number':
        this.#controls.push(NumberInput.create(host, { label: v.label, value: typeof value === 'number' ? value : null, ...(v.min === undefined ? {} : { min: v.min }), ...(v.max === undefined ? {} : { max: v.max }) }));
        on((d) => this.#target.setVariable(v.id, (d as { value: number | null }).value));
        break;
    }
    return host;
  }

  /** Updates enabled states and edit-only items after a mode or definition change. */
  sync(): void {
    const editing = this.#target.mode() === 'edit';
    for (const el of this.#editItems) el.hidden = !editing;
    this.#editSwitch?.update({ checked: editing });
    this.#undo?.update({ disabled: !this.#target.canUndo() });
    this.#redo?.update({ disabled: !this.#target.canRedo() });
    this.#reset?.update({ disabled: !this.#target.isDirty() });
  }

  destroy(): void {
    this.#group.dispose();
    for (const c of this.#controls.splice(0)) c.destroy();
    this.element.remove();
  }
}
