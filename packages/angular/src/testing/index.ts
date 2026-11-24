/**
 * @absoluteui/angular/testing (docs/PLAN-R9-ANGULAR.md M8, D9/D23): component harnesses on
 * @angular/cdk/testing (optional peer). Harnesses act through the rendered DOM the way a user
 * does (click, type, keys) and read what a user perceives (labels, text, ARIA state); they never
 * reach the component controller.
 *
 * ```ts
 * const loader = TestbedHarnessEnvironment.loader(fixture);
 * const email = await loader.getHarness(AuiTextInputHarness.with({ label: 'Email' }));
 * await email.setValue('ada@example.com');
 * // Dialogs render in the body layer: use the document root loader.
 * const dialog = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(AuiDialogHarness);
 * ```
 */
import { ComponentHarness, HarnessPredicate, TestKey, type BaseHarnessFilters, type ComponentHarnessConstructor, type TestElement } from '@angular/cdk/testing';

/** Visible text without surrounding whitespace; empty text is null. */
async function textOrNull(element: TestElement | null): Promise<string | null> {
  if (!element) return null;
  if (await element.getProperty<boolean>('hidden')) return null;
  const text = (await element.text()).trim();
  return text === '' ? null : text;
}

/** A label without its required marker. */
async function labelText(element: TestElement | null, marker: string): Promise<string> {
  if (!element) return '';
  return (await element.text({ exclude: marker })).trim();
}

// ---------------------------------------------------------------- Button

/** Filters for `AuiButtonHarness.with()`. */
export interface AuiButtonHarnessFilters extends BaseHarnessFilters {
  /** Visible text (or accessible label of an icon-only button). */
  text?: string | RegExp;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
}

/** `button[auiButton]` and `a[auiButton]`. */
export class AuiButtonHarness extends ComponentHarness {
  static hostSelector = 'button.aui-button, a.aui-button';

  static with<T extends AuiButtonHarness>(this: ComponentHarnessConstructor<T>, options: AuiButtonHarnessFilters = {}): HarnessPredicate<T> {
    return new HarnessPredicate(this, options)
      .addOption('text', options.text, (h, text) => HarnessPredicate.stringMatches(h.getText(), text))
      .addOption('variant', options.variant, async (h, variant) => (await h.getVariant()) === variant);
  }

  /** Visible text, or the accessible label of an icon-only button. */
  async getText(): Promise<string> {
    const host = await this.host();
    const text = (await host.text()).trim();
    return text !== '' ? text : ((await host.getAttribute('aria-label')) ?? '');
  }

  async getVariant(): Promise<string | null> {
    const host = await this.host();
    for (const v of ['primary', 'secondary', 'outline', 'ghost', 'danger']) if (await host.hasClass(`aui-button--${v}`)) return v;
    return null;
  }

  /** Native `disabled`, or `aria-disabled` (disabled links, loading). */
  async isDisabled(): Promise<boolean> {
    const host = await this.host();
    return (await host.getProperty<boolean>('disabled')) || (await host.getAttribute('aria-disabled')) === 'true';
  }

  async isLoading(): Promise<boolean> {
    return (await (await this.host()).getAttribute('data-loading')) !== null;
  }

  async isLink(): Promise<boolean> {
    return (await this.host()).matchesSelector('a');
  }

  async click(): Promise<void> {
    await (await this.host()).click();
  }

  async focus(): Promise<void> {
    await (await this.host()).focus();
  }
}

// ---------------------------------------------------------------- Fields

/** Filters for the form field harnesses (`with({ label })`). */
export interface AuiFieldHarnessFilters extends BaseHarnessFilters {
  /** Visible label (without the required marker). */
  label?: string | RegExp;
}

/** Label, description, validation message, required and disabled state of a form field. */
export abstract class AuiFieldHarness extends ComponentHarness {
  protected readonly labelElement = this.locatorForOptional('.aui-field__label');
  protected readonly descriptionElement = this.locatorForOptional('.aui-field__description');
  protected readonly errorElement = this.locatorForOptional('.aui-field__error');
  /** The element that receives focus and carries `aria-invalid`/`disabled`. */
  protected abstract control(): Promise<TestElement>;

  async getLabel(): Promise<string> {
    return labelText(await this.labelElement(), '.aui-field__required');
  }

  async getDescription(): Promise<string | null> {
    return textOrNull(await this.descriptionElement());
  }

  /** The message shown to the user, or null. */
  async getErrorMessage(): Promise<string | null> {
    return textOrNull(await this.errorElement());
  }

  async isRequired(): Promise<boolean> {
    const control = await this.control();
    return (await control.getAttribute('aria-required')) === 'true' || (await control.getProperty<boolean>('required'));
  }

  async isDisabled(): Promise<boolean> {
    const control = await this.control();
    return (await control.getProperty<boolean>('disabled')) || (await control.getAttribute('aria-disabled')) === 'true';
  }

  async isInvalid(): Promise<boolean> {
    return (await (await this.control()).getAttribute('aria-invalid')) === 'true';
  }

  async focus(): Promise<void> {
    await (await this.control()).focus();
  }

  /** Leaves the field (marks it touched). */
  async blur(): Promise<void> {
    await (await this.control()).blur();
  }
}

function fieldPredicate<T extends AuiFieldHarness>(type: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters): HarnessPredicate<T> {
  return new HarnessPredicate(type, options).addOption('label', options.label, (h, label) => HarnessPredicate.stringMatches(h.getLabel(), label));
}

/** `<aui-text-input>`. */
export class AuiTextInputHarness extends AuiFieldHarness {
  static hostSelector = 'aui-text-input';
  protected readonly input = this.locatorFor('input.aui-text-input__input');

  static with<T extends AuiTextInputHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  protected control(): Promise<TestElement> {
    return this.input();
  }

  async getValue(): Promise<string> {
    return (await this.input()).getProperty<string>('value');
  }

  /** Replaces the value by typing, as a user would (input events per key). */
  async setValue(value: string): Promise<void> {
    const input = await this.input();
    await input.clear();
    if (value !== '') await input.sendKeys(value);
  }

  async getPlaceholder(): Promise<string> {
    return (await (await this.input()).getAttribute('placeholder')) ?? '';
  }
}

/** An option of a Select, as the harness reads it. */
export interface AuiSelectOption {
  label: string;
  disabled: boolean;
  selected: boolean;
}

/** `<aui-select>`. The listbox renders inside the host. */
export class AuiSelectHarness extends AuiFieldHarness {
  static hostSelector = 'aui-select';
  protected readonly trigger = this.locatorFor('[role="combobox"]');
  protected readonly valueElement = this.locatorFor('.aui-select__value');
  protected readonly options = this.locatorForAll('[role="option"]');

  static with<T extends AuiSelectHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  protected control(): Promise<TestElement> {
    return this.trigger();
  }

  /** The selected option's label as shown, or the placeholder. */
  async getValueText(): Promise<string> {
    return (await (await this.valueElement()).text()).trim();
  }

  async isOpen(): Promise<boolean> {
    return (await (await this.trigger()).getAttribute('aria-expanded')) === 'true';
  }

  async open(): Promise<void> {
    if (!(await this.isOpen())) await (await this.trigger()).click();
  }

  async close(): Promise<void> {
    if (await this.isOpen()) await (await this.trigger()).sendKeys(TestKey.ESCAPE);
  }

  /** Options (opens the listbox first). */
  async getOptions(): Promise<AuiSelectOption[]> {
    await this.open();
    const out: AuiSelectOption[] = [];
    for (const option of await this.options()) {
      out.push({
        label: (await option.text({ exclude: '.aui-select__option-description' })).trim(),
        disabled: (await option.getAttribute('aria-disabled')) === 'true',
        selected: (await option.getAttribute('aria-selected')) === 'true',
      });
    }
    return out;
  }

  /** Opens the listbox and chooses the first option whose label matches. */
  async selectOption(label: string | RegExp): Promise<void> {
    await this.open();
    for (const option of await this.options()) {
      const text = (await option.text({ exclude: '.aui-select__option-description' })).trim();
      if (typeof label === 'string' ? text === label : label.test(text)) {
        await option.click();
        return;
      }
    }
    throw new Error(`AuiSelectHarness: no option matches ${String(label)}.`);
  }
}

/** `<aui-date-picker>`: typed segments and the calendar popup. */
export class AuiDatePickerHarness extends AuiFieldHarness {
  static hostSelector = 'aui-date-picker';
  protected override readonly labelElement = this.locatorForOptional('.aui-date-input__label');
  protected override readonly descriptionElement = this.locatorForOptional('.aui-date-input__description');
  protected override readonly errorElement = this.locatorForOptional('.aui-date-input__error');
  protected readonly group = this.locatorFor('.aui-date-input__group');
  protected readonly segments = this.locatorForAll('input.aui-date-input__segment');
  protected readonly calendarButton = this.locatorFor('button.aui-date-picker__button');
  protected readonly popup = this.locatorFor('.aui-date-picker__popup');
  protected readonly heading = this.locatorForOptional('.aui-date-picker__popup .aui-calendar__heading');
  protected readonly days = this.locatorForAll('.aui-date-picker__popup td.aui-calendar__day:not(.aui-calendar__day--empty):not(.aui-calendar__day--outside)');

  static with<T extends AuiDatePickerHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  override async getLabel(): Promise<string> {
    return labelText(await this.labelElement(), '.aui-date-input__required, .aui-field__required');
  }

  protected async control(): Promise<TestElement> {
    const [first] = await this.segments();
    return first ?? this.group();
  }

  /** The typed segments in display order, e.g. ['08', '03', '2026'] in en-GB. */
  async getSegments(): Promise<string[]> {
    return Promise.all((await this.segments()).map((s) => s.getProperty<string>('value')));
  }

  /** Types a date into the segments by their accessible names (locale-independent). */
  async typeDate(date: { year: number; month: number; day: number }): Promise<void> {
    const values: Record<string, string> = { year: String(date.year), month: String(date.month).padStart(2, '0'), day: String(date.day).padStart(2, '0') };
    for (const segment of await this.segments()) {
      const name = ((await segment.getAttribute('aria-label')) ?? '').toLowerCase();
      const value = values[name];
      if (value === undefined) continue;
      await segment.clear();
      await segment.sendKeys(value);
    }
    await (await this.control()).blur();
  }

  async isCalendarOpen(): Promise<boolean> {
    return !(await (await this.popup()).getProperty<boolean>('hidden'));
  }

  async openCalendar(): Promise<void> {
    if (!(await this.isCalendarOpen())) await (await this.calendarButton()).click();
  }

  /** The visible month heading, e.g. "November 2026". */
  async getCalendarMonth(): Promise<string> {
    await this.openCalendar();
    return (await (await this.heading())?.text())?.trim() ?? '';
  }

  /** Accessible names of the days of the visible month (they name non-working days and holidays). */
  async getDayLabels(): Promise<string[]> {
    await this.openCalendar();
    return Promise.all((await this.days()).map(async (d) => (await d.getAttribute('aria-label')) ?? ''));
  }

  async isDayDisabled(day: number): Promise<boolean> {
    return (await (await this.#day(day)).getAttribute('aria-disabled')) === 'true';
  }

  /** Chooses a day of the visible month in the calendar. */
  async selectDay(day: number): Promise<void> {
    await (await this.#day(day)).click();
  }

  async nextMonth(): Promise<void> {
    await this.openCalendar();
    await (await this.locatorFor('.aui-date-picker__popup button[aria-label="Next month"]')()).click();
  }

  async previousMonth(): Promise<void> {
    await this.openCalendar();
    await (await this.locatorFor('.aui-date-picker__popup button[aria-label="Previous month"]')()).click();
  }

  async #day(day: number): Promise<TestElement> {
    await this.openCalendar();
    for (const cell of await this.days()) if ((await cell.text()).trim() === String(day)) return cell;
    throw new Error(`AuiDatePickerHarness: day ${String(day)} is not in the visible month.`);
  }
}

// ---------------------------------------------------------------- Tabs

/** Filters for `AuiTabsHarness.with()`. */
export interface AuiTabsHarnessFilters extends BaseHarnessFilters {
  /** Accessible name of the tab list. */
  label?: string | RegExp;
}

/** `<aui-tabs>`. */
export class AuiTabsHarness extends ComponentHarness {
  static hostSelector = 'aui-tabs';
  protected readonly list = this.locatorFor('[role="tablist"]');
  protected readonly tabs = this.locatorForAll('[role="tab"]');
  protected readonly panels = this.locatorForAll('[role="tabpanel"]');

  static with<T extends AuiTabsHarness>(this: ComponentHarnessConstructor<T>, options: AuiTabsHarnessFilters = {}): HarnessPredicate<T> {
    return new HarnessPredicate(this, options).addOption('label', options.label, async (h, label) => HarnessPredicate.stringMatches(h.getLabel(), label));
  }

  async getLabel(): Promise<string> {
    return (await (await this.list()).getAttribute('aria-label')) ?? '';
  }

  async getTabLabels(): Promise<string[]> {
    return Promise.all((await this.tabs()).map(async (t) => (await t.text()).trim()));
  }

  async getSelectedTabLabel(): Promise<string | null> {
    for (const tab of await this.tabs()) if ((await tab.getAttribute('aria-selected')) === 'true') return (await tab.text()).trim();
    return null;
  }

  async isTabDisabled(label: string): Promise<boolean> {
    const tab = await this.#tab(label);
    return (await tab.getProperty<boolean>('disabled')) || (await tab.getAttribute('aria-disabled')) === 'true';
  }

  async selectTab(label: string): Promise<void> {
    await (await this.#tab(label)).click();
  }

  /** Text of the visible panel. */
  async getPanelText(): Promise<string> {
    for (const panel of await this.panels()) if (!(await panel.getProperty<boolean>('hidden'))) return (await panel.text()).trim();
    return '';
  }

  async #tab(label: string): Promise<TestElement> {
    for (const tab of await this.tabs()) if ((await tab.text()).trim() === label) return tab;
    throw new Error(`AuiTabsHarness: no tab "${label}".`);
  }
}

// ---------------------------------------------------------------- Dialog

/** Filters for `AuiDialogHarness.with()`. */
export interface AuiDialogHarnessFilters extends BaseHarnessFilters {
  title?: string | RegExp;
}

/**
 * An open AbsoluteUI dialog (`<aui-dialog>` or `AuiDialogService`). Dialogs render in the body
 * layer: load it with `TestbedHarnessEnvironment.documentRootLoader(fixture)`.
 */
export class AuiDialogHarness extends ComponentHarness {
  static hostSelector = 'dialog.aui-dialog[open]';
  protected readonly titleElement = this.locatorFor('.aui-dialog__title');
  protected readonly descriptionElement = this.locatorForOptional('.aui-dialog__description');
  protected readonly bodyElement = this.locatorFor('.aui-dialog__body');
  protected readonly actionButtons = this.locatorForAll('.aui-dialog__footer button');
  protected readonly closeButton = this.locatorForOptional('button.aui-dialog__close');

  static with<T extends AuiDialogHarness>(this: ComponentHarnessConstructor<T>, options: AuiDialogHarnessFilters = {}): HarnessPredicate<T> {
    return new HarnessPredicate(this, options).addOption('title', options.title, (h, title) => HarnessPredicate.stringMatches(h.getTitle(), title));
  }

  async getTitle(): Promise<string> {
    return (await (await this.titleElement()).text()).trim();
  }

  async getDescription(): Promise<string | null> {
    return textOrNull(await this.descriptionElement());
  }

  async getBodyText(): Promise<string> {
    return (await (await this.bodyElement()).text()).trim();
  }

  /** `dialog` or `alertdialog`. */
  async getRole(): Promise<string> {
    return (await (await this.host()).getAttribute('role')) ?? 'dialog';
  }

  async getActionLabels(): Promise<string[]> {
    return Promise.all((await this.actionButtons()).map(async (b) => (await b.text()).trim()));
  }

  async clickAction(label: string): Promise<void> {
    for (const button of await this.actionButtons()) {
      if ((await button.text()).trim() === label) {
        await button.click();
        return;
      }
    }
    throw new Error(`AuiDialogHarness: no action "${label}".`);
  }

  /** Text of the element that has focus inside the dialog, or null. */
  async getFocusedText(): Promise<string | null> {
    const focused = await this.locatorForOptional(':focus')();
    return focused ? (await focused.text()).trim() : null;
  }

  async close(): Promise<void> {
    const button = await this.closeButton();
    if (!button) throw new Error('AuiDialogHarness: the dialog has no close button.');
    await button.click();
  }

  async pressEscape(): Promise<void> {
    await (await this.host()).sendKeys(TestKey.ESCAPE);
  }
}

// ---------------------------------------------------------------- Data Table

const HIDDEN_TEXT = '.aui-data-table__visually-hidden, .aui-data-table__sort-priority';

/** A column header of `<aui-data-table>`. */
export class AuiDataTableHeaderHarness extends ComponentHarness {
  static hostSelector = 'thead tr.aui-data-table__header-row > th';
  protected readonly sortButton = this.locatorForOptional('button.aui-data-table__sort');

  async getText(): Promise<string> {
    return (await (await this.host()).text({ exclude: HIDDEN_TEXT })).trim();
  }

  async isSortable(): Promise<boolean> {
    return (await this.sortButton()) !== null;
  }

  /** The sort direction of the primary sort (`aria-sort`), or null. */
  async getSortDirection(): Promise<'ascending' | 'descending' | null> {
    const sort = await (await this.host()).getAttribute('aria-sort');
    return sort === 'ascending' || sort === 'descending' ? sort : null;
  }

  /** Activates the sort button (cycles ascending, descending, unsorted). */
  async sort(): Promise<void> {
    const button = await this.sortButton();
    if (!button) throw new Error('AuiDataTableHeaderHarness: the column is not sortable.');
    await button.click();
  }
}

/** A rendered data row of `<aui-data-table>`. */
export class AuiDataTableRowHarness extends ComponentHarness {
  static hostSelector = 'tbody tr.aui-data-table__row:not(.aui-data-table__skeleton-row)';
  protected readonly cells = this.locatorForAll(':scope > th, :scope > td');
  protected readonly selectBox = this.locatorForOptional('input[data-row-id]');

  /** Cell texts in column order (selection and expander cells are empty strings). */
  async getCellTexts(): Promise<string[]> {
    return Promise.all((await this.cells()).map(async (c) => (await c.text({ exclude: HIDDEN_TEXT })).trim()));
  }

  async isSelected(): Promise<boolean> {
    return (await this.host()).hasClass('aui-data-table__row--selected');
  }

  /** Toggles the row's selection control. */
  async toggleSelection(): Promise<void> {
    const box = await this.selectBox();
    if (!box) throw new Error('AuiDataTableRowHarness: the row has no selection control.');
    await box.click();
  }

  async isEditable(columnId: string): Promise<boolean> {
    return (await this.locatorForOptional(`button.aui-data-table__edit[data-column="${columnId}"]`)()) !== null;
  }

  /** True while a cell editor is open in this row (for example after an invalid value). */
  async isEditing(): Promise<boolean> {
    return (await this.locatorForOptional('.aui-data-table__editor')()) !== null;
  }

  /** Opens a cell editor (the row is rebuilt: query the row again afterwards). No-op while one is open. */
  async startEdit(columnId: string): Promise<void> {
    if (await this.isEditing()) return;
    const button = await this.locatorForOptional(`button.aui-data-table__edit[data-column="${columnId}"]`)();
    if (!button) throw new Error(`AuiDataTableRowHarness: column "${columnId}" is not editable in this row.`);
    await button.click();
  }

  /** Replaces the open editor's text and commits with Enter (the row is rebuilt: query it again). */
  async commitEdit(value: string): Promise<void> {
    const input = await this.locatorFor('.aui-data-table__editor input')();
    await input.clear();
    if (value !== '') await input.sendKeys(value);
    await input.sendKeys(TestKey.ENTER);
  }
}

/** Filters for `AuiDataTableHarness.with()`. */
export interface AuiDataTableHarnessFilters extends BaseHarnessFilters {
  caption?: string | RegExp;
}

/** `<aui-data-table>`: rows are the rendered data rows of the current page (or virtual window). */
export class AuiDataTableHarness extends ComponentHarness {
  static hostSelector = 'aui-data-table';
  protected readonly captionElement = this.locatorFor('caption');
  protected readonly searchInput = this.locatorForOptional('input.aui-data-table__search-input');

  static with<T extends AuiDataTableHarness>(this: ComponentHarnessConstructor<T>, options: AuiDataTableHarnessFilters = {}): HarnessPredicate<T> {
    return new HarnessPredicate(this, options).addOption('caption', options.caption, (h, caption) => HarnessPredicate.stringMatches(h.getCaption(), caption));
  }

  async getCaption(): Promise<string> {
    return (await (await this.captionElement()).text()).trim();
  }

  getHeaders(): Promise<AuiDataTableHeaderHarness[]> {
    return this.locatorForAll(AuiDataTableHeaderHarness)();
  }

  async getHeaderTexts(): Promise<string[]> {
    return Promise.all((await this.getHeaders()).map((h) => h.getText()));
  }

  async getHeader(text: string): Promise<AuiDataTableHeaderHarness> {
    for (const header of await this.getHeaders()) if ((await header.getText()) === text) return header;
    throw new Error(`AuiDataTableHarness: no column "${text}".`);
  }

  getRows(): Promise<AuiDataTableRowHarness[]> {
    return this.locatorForAll(AuiDataTableRowHarness)();
  }

  /** Cell texts of every rendered row. */
  async getCellTexts(): Promise<string[][]> {
    return Promise.all((await this.getRows()).map((r) => r.getCellTexts()));
  }

  /** The primary sort, or null. */
  async getSort(): Promise<{ column: string; direction: 'ascending' | 'descending' } | null> {
    for (const header of await this.getHeaders()) {
      const direction = await header.getSortDirection();
      if (direction) return { column: await header.getText(), direction };
    }
    return null;
  }

  async sortBy(header: string): Promise<void> {
    await (await this.getHeader(header)).sort();
  }

  /** Types into the search field and presses Enter, which applies it without the typing delay. */
  async search(text: string): Promise<void> {
    const input = await this.searchInput();
    if (!input) throw new Error('AuiDataTableHarness: the table is not searchable.');
    await input.clear();
    if (text !== '') await input.sendKeys(text);
    await input.sendKeys(TestKey.ENTER);
  }

  /**
   * Opens the editor of a cell (rendered row index, column id), replaces its text, and commits
   * with Enter. Returns the message shown for an invalid value (the editor stays open), or null.
   */
  async editCell(rowIndex: number, columnId: string, value: string): Promise<string | null> {
    const row = (await this.getRows())[rowIndex];
    if (!row) throw new Error(`AuiDataTableHarness: no row ${String(rowIndex)}.`);
    await row.startEdit(columnId);
    // Opening the editor rebuilds the row: query it again.
    const rebuilt = (await this.getRows())[rowIndex];
    if (!rebuilt) throw new Error(`AuiDataTableHarness: no row ${String(rowIndex)}.`);
    await rebuilt.commitEdit(value);
    return this.getEditError();
  }

  /** The message of an open cell editor (invalid value), or null. */
  async getEditError(): Promise<string | null> {
    return textOrNull(await this.locatorForOptional('.aui-data-table__edit-error')());
  }

  /** Moves to another page through the pager. */
  async goToPage(target: 'next' | 'previous' | 'first' | 'last' | number): Promise<void> {
    const selector = typeof target === 'number' ? `.aui-data-table__pagination button[data-page="${String(target)}"]` : `.aui-data-table__pagination button[data-key="${target}"]`;
    await (await this.locatorFor(selector)()).click();
  }
}

// ---------------------------------------------------------------- More controls (M9, D31)

/** `<aui-checkbox>`. */
export class AuiCheckboxHarness extends AuiFieldHarness {
  static hostSelector = 'aui-checkbox';
  protected readonly input = this.locatorFor('input.aui-checkbox__input');

  static with<T extends AuiCheckboxHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  protected control(): Promise<TestElement> {
    return this.input();
  }

  async isChecked(): Promise<boolean> {
    return (await this.input()).getProperty<boolean>('checked');
  }

  async isIndeterminate(): Promise<boolean> {
    return (await this.input()).getProperty<boolean>('indeterminate');
  }

  async toggle(): Promise<void> {
    await (await this.input()).click();
  }

  async check(): Promise<void> {
    if (!(await this.isChecked())) await this.toggle();
  }

  async uncheck(): Promise<void> {
    if (await this.isChecked()) await this.toggle();
  }
}

/** `<aui-switch>`. */
export class AuiSwitchHarness extends AuiFieldHarness {
  static hostSelector = 'aui-switch';
  protected readonly input = this.locatorFor('input.aui-switch__input');

  static with<T extends AuiSwitchHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  protected control(): Promise<TestElement> {
    return this.input();
  }

  async isChecked(): Promise<boolean> {
    return (await this.input()).getProperty<boolean>('checked');
  }

  async toggle(): Promise<void> {
    await (await this.input()).click();
  }
}

/** `<aui-radio-group>`. */
export class AuiRadioGroupHarness extends AuiFieldHarness {
  static hostSelector = 'aui-radio-group';
  protected readonly inputs = this.locatorForAll('input.aui-radio-group__input');
  protected readonly labels = this.locatorForAll('.aui-radio-group__option .aui-radio-group__label');

  static with<T extends AuiRadioGroupHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  protected async control(): Promise<TestElement> {
    const [first] = await this.inputs();
    if (!first) throw new Error('AuiRadioGroupHarness: no options.');
    return first;
  }

  async getOptionLabels(): Promise<string[]> {
    return Promise.all((await this.labels()).map(async (l) => (await l.text()).trim()));
  }

  /** Label of the checked option, or null. */
  async getCheckedLabel(): Promise<string | null> {
    const inputs = await this.inputs();
    const labels = await this.getOptionLabels();
    for (const [i, input] of inputs.entries()) if (await input.getProperty<boolean>('checked')) return labels[i] ?? null;
    return null;
  }

  async isOptionDisabled(label: string): Promise<boolean> {
    return await (await this.#option(label)).getProperty<boolean>('disabled');
  }

  async select(label: string): Promise<void> {
    await (await this.#option(label)).click();
  }

  async #option(label: string): Promise<TestElement> {
    const labels = await this.getOptionLabels();
    const input = (await this.inputs())[labels.indexOf(label)];
    if (!input) throw new Error(`AuiRadioGroupHarness: no option "${label}".`);
    return input;
  }
}

/** `<aui-textarea>`. */
export class AuiTextareaHarness extends AuiFieldHarness {
  static hostSelector = 'aui-textarea';
  protected readonly input = this.locatorFor('textarea.aui-textarea__input');

  static with<T extends AuiTextareaHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  protected control(): Promise<TestElement> {
    return this.input();
  }

  async getValue(): Promise<string> {
    return (await this.input()).getProperty<string>('value');
  }

  async setValue(value: string): Promise<void> {
    const input = await this.input();
    await input.clear();
    if (value !== '') await input.sendKeys(value);
  }
}

/** `<aui-number-input>`: typing and the spin button keys. */
export class AuiNumberInputHarness extends AuiFieldHarness {
  static hostSelector = 'aui-number-input';
  protected readonly input = this.locatorFor('input[role="spinbutton"]');

  static with<T extends AuiNumberInputHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  protected control(): Promise<TestElement> {
    return this.input();
  }

  /** The text shown (formatted for the locale). */
  async getText(): Promise<string> {
    return (await this.input()).getProperty<string>('value');
  }

  /** The value as announced (`aria-valuenow`), or null when empty. */
  async getValue(): Promise<number | null> {
    const now = await (await this.input()).getAttribute('aria-valuenow');
    return now === null || now === '' ? null : Number(now);
  }

  /** Types text and leaves the field, as a user would. */
  async setText(text: string): Promise<void> {
    const input = await this.input();
    await input.clear();
    if (text !== '') await input.sendKeys(text);
    await input.blur();
  }

  async increment(): Promise<void> {
    await (await this.input()).sendKeys(TestKey.UP_ARROW);
  }

  async decrement(): Promise<void> {
    await (await this.input()).sendKeys(TestKey.DOWN_ARROW);
  }
}

/** `<aui-combobox>`: typing, options (static or loaded), choosing. */
export class AuiComboboxHarness extends AuiFieldHarness {
  static hostSelector = 'aui-combobox';
  protected override readonly labelElement = this.locatorForOptional('.aui-combobox__label');
  protected override readonly descriptionElement = this.locatorForOptional('.aui-combobox__description');
  protected override readonly errorElement = this.locatorForOptional('.aui-combobox__error');
  protected readonly input = this.locatorFor('input[role="combobox"]');
  protected readonly options = this.locatorForAll('[role="option"]');

  static with<T extends AuiComboboxHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  override async getLabel(): Promise<string> {
    return labelText(await this.labelElement(), '.aui-combobox__required, .aui-field__required');
  }

  protected control(): Promise<TestElement> {
    return this.input();
  }

  async getInputText(): Promise<string> {
    return (await this.input()).getProperty<string>('value');
  }

  async isOpen(): Promise<boolean> {
    return (await (await this.input()).getAttribute('aria-expanded')) === 'true';
  }

  /** Replaces the text by typing (filters the options or starts a load). */
  async type(text: string): Promise<void> {
    const input = await this.input();
    await input.clear();
    if (text !== '') await input.sendKeys(text);
  }

  /** Labels of the options shown. */
  async getOptionLabels(): Promise<string[]> {
    return Promise.all((await this.options()).map(async (o) => (await o.text({ exclude: '.aui-combobox__option-description' })).trim()));
  }

  /** Waits (up to `timeout` ms) until at least one option is shown: loads are debounced outside Angular's stability tracking. */
  async waitForOptions(timeout = 2000): Promise<string[]> {
    const end = Date.now() + timeout;
    for (;;) {
      await this.forceStabilize();
      const labels = await this.getOptionLabels();
      if (labels.length > 0 || Date.now() > end) return labels;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  async selectOption(label: string | RegExp): Promise<void> {
    for (const option of await this.options()) {
      const text = (await option.text({ exclude: '.aui-combobox__option-description' })).trim();
      if (typeof label === 'string' ? text === label : label.test(text)) {
        await option.click();
        return;
      }
    }
    throw new Error(`AuiComboboxHarness: no option matches ${String(label)}.`);
  }
}

/** `<aui-multi-select>`: typing, toggling options, selected chips. */
export class AuiMultiSelectHarness extends AuiFieldHarness {
  static hostSelector = 'aui-multi-select';
  protected override readonly labelElement = this.locatorForOptional('.aui-multi-select__label');
  protected override readonly descriptionElement = this.locatorForOptional('.aui-multi-select__description');
  protected override readonly errorElement = this.locatorForOptional('.aui-multi-select__error');
  protected readonly input = this.locatorFor('input[role="combobox"]');
  protected readonly toggle = this.locatorFor('.aui-multi-select__toggle');
  protected readonly chipLabels = this.locatorForAll('.aui-multi-select__chip-label');
  protected readonly removeButtons = this.locatorForAll('.aui-multi-select__remove');
  protected readonly options = this.locatorForAll('[role="option"]');

  static with<T extends AuiMultiSelectHarness>(this: ComponentHarnessConstructor<T>, options: AuiFieldHarnessFilters = {}): HarnessPredicate<T> {
    return fieldPredicate(this, options);
  }

  override async getLabel(): Promise<string> {
    return labelText(await this.labelElement(), '.aui-field__required');
  }

  protected control(): Promise<TestElement> {
    return this.input();
  }

  async isOpen(): Promise<boolean> {
    return (await (await this.input()).getAttribute('aria-expanded')) === 'true';
  }

  async open(): Promise<void> {
    if (!(await this.isOpen())) await (await this.toggle()).click();
  }

  async close(): Promise<void> {
    if (await this.isOpen()) await (await this.input()).sendKeys(TestKey.ESCAPE);
  }

  /** Replaces the text by typing (filters the options or starts a load). */
  async type(text: string): Promise<void> {
    const input = await this.input();
    await input.clear();
    if (text !== '') await input.sendKeys(text);
  }

  /** Labels of the selected values (the chips), in selection order. */
  async getSelectedLabels(): Promise<string[]> {
    return Promise.all((await this.chipLabels()).map(async (c) => (await c.text()).trim()));
  }

  /** Labels of the options shown (including "Select all" when enabled). */
  async getOptionLabels(): Promise<string[]> {
    return Promise.all((await this.options()).map(async (o) => (await o.text({ exclude: '.aui-multi-select__option-description' })).trim()));
  }

  /** Toggles the option with this label (opens the list first). */
  async toggleOption(label: string | RegExp): Promise<void> {
    await this.open();
    for (const option of await this.options()) {
      const text = (await option.text({ exclude: '.aui-multi-select__option-description' })).trim();
      if (typeof label === 'string' ? text === label : label.test(text)) {
        await option.click();
        return;
      }
    }
    throw new Error(`AuiMultiSelectHarness: no option matches ${String(label)}.`);
  }

  /** Removes a selected value with its chip remove button (not available when read-only or disabled). */
  async removeValue(label: string): Promise<void> {
    const index = (await this.getSelectedLabels()).indexOf(label);
    const button = index < 0 ? undefined : (await this.removeButtons())[index];
    if (!button) throw new Error(`AuiMultiSelectHarness: no removable selected value ${label}.`);
    await button.click();
  }
}

/** Filters for `AuiSidebarHarness.with()`. */
export interface AuiSidebarHarnessFilters extends BaseHarnessFilters {
  label?: string | RegExp;
}

/** `<aui-sidebar>`. */
export class AuiSidebarHarness extends ComponentHarness {
  static hostSelector = 'aui-sidebar';
  protected readonly nav = this.locatorFor('nav.aui-sidebar__nav');
  protected readonly items = this.locatorForAll('.aui-sidebar__item');
  protected readonly toggleButton = this.locatorForOptional('button.aui-sidebar__toggle');

  static with<T extends AuiSidebarHarness>(this: ComponentHarnessConstructor<T>, options: AuiSidebarHarnessFilters = {}): HarnessPredicate<T> {
    return new HarnessPredicate(this, options).addOption('label', options.label, (h, label) => HarnessPredicate.stringMatches(h.getLabel(), label));
  }

  async getLabel(): Promise<string> {
    return (await (await this.nav()).getAttribute('aria-label')) ?? '';
  }

  /** Labels of the visible items (items of collapsed groups are hidden). */
  async getItemLabels(): Promise<string[]> {
    const out: string[] = [];
    for (const item of await this.items()) if (!(await item.matchesSelector('[hidden] *'))) out.push(await this.#label(item));
    return out;
  }

  /** Label of the current item (`aria-current="page"`), or null. */
  async getCurrentLabel(): Promise<string | null> {
    for (const item of await this.items()) if ((await item.getAttribute('aria-current')) === 'page') return this.#label(item);
    return null;
  }

  /** Activates an item or toggles a group, as a click does. */
  async click(label: string): Promise<void> {
    await (await this.#item(label)).click();
  }

  async isGroupExpanded(label: string): Promise<boolean> {
    return (await (await this.#item(label)).getAttribute('aria-expanded')) === 'true';
  }

  async isCollapsed(): Promise<boolean> {
    return (await this.host()).hasClass('aui-sidebar--collapsed');
  }

  /** The collapse button (inline mode, collapsible). */
  async toggleCollapsed(): Promise<void> {
    const button = await this.toggleButton();
    if (!button) throw new Error('AuiSidebarHarness: the sidebar is not collapsible.');
    await button.click();
  }

  async #label(item: TestElement): Promise<string> {
    return (await item.text({ exclude: '.aui-sidebar__icon' })).trim();
  }

  async #item(label: string): Promise<TestElement> {
    for (const item of await this.items()) if ((await this.#label(item)) === label) return item;
    throw new Error(`AuiSidebarHarness: no item "${label}".`);
  }
}

/** `<aui-pagination>`. */
export class AuiPaginationHarness extends ComponentHarness {
  static hostSelector = 'aui-pagination';
  protected readonly current = this.locatorForOptional('[aria-current="page"]');
  protected readonly pageButtons = this.locatorForAll('button[data-page]');

  async getCurrentPage(): Promise<number | null> {
    const el = await this.current();
    const page = el ? await el.getAttribute('data-page') : null;
    return page === null ? null : Number(page);
  }

  /** Page numbers shown as buttons (ellipses are not pages). */
  async getPageNumbers(): Promise<number[]> {
    return Promise.all((await this.pageButtons()).map(async (b) => Number(await b.getAttribute('data-page'))));
  }

  async isDisabled(target: 'next' | 'previous' | 'first' | 'last'): Promise<boolean> {
    const button = await this.locatorFor(`button[data-key="${target}"]`)();
    return (await button.getProperty<boolean>('disabled')) || (await button.getAttribute('aria-disabled')) === 'true';
  }

  async goTo(target: 'next' | 'previous' | 'first' | 'last' | number): Promise<void> {
    const selector = typeof target === 'number' ? `button[data-page="${String(target)}"]` : `button[data-key="${target}"]`;
    await (await this.locatorFor(selector)()).click();
  }
}

/** A menu item, as the harness reads it. */
export interface AuiMenuItem {
  label: string;
  disabled: boolean;
  /** For checkbox and radio items; null for actions. */
  checked: boolean | null;
  hasSubmenu: boolean;
}

/** Filters for `AuiMenuHarness.with()`. */
export interface AuiMenuHarnessFilters extends BaseHarnessFilters {
  /** Trigger text. */
  triggerText?: string | RegExp;
}

/** Not part of an item's accessible label: description, shortcut, and decorative renderItem content. */
const MENU_ITEM_EXTRA = '.aui-menu__description, .aui-menu__shortcut, .aui-menu__custom';

/** `button[auiMenu]`: the trigger; the menu renders next to it, so items are read from the document. */
export class AuiMenuHarness extends ComponentHarness {
  static hostSelector = 'button[aria-haspopup="menu"]';

  static with<T extends AuiMenuHarness>(this: ComponentHarnessConstructor<T>, options: AuiMenuHarnessFilters = {}): HarnessPredicate<T> {
    return new HarnessPredicate(this, options).addOption('triggerText', options.triggerText, async (h, text) => HarnessPredicate.stringMatches((await h.host()).text(), text));
  }

  async isOpen(): Promise<boolean> {
    return (await (await this.host()).getAttribute('aria-expanded')) === 'true';
  }

  async open(): Promise<void> {
    if (!(await this.isOpen())) await (await this.host()).click();
  }

  async close(): Promise<void> {
    if (await this.isOpen()) await (await this.#menu()).sendKeys(TestKey.ESCAPE);
  }

  /** Items of the top-level menu (opens it). */
  async getItems(): Promise<AuiMenuItem[]> {
    await this.open();
    const id = await this.#menuId();
    const items = await this.documentRootLocatorFactory().locatorForAll(`#${id} > [role^="menuitem"], #${id} > .aui-menu__group > [role^="menuitem"]`)();
    return Promise.all(
      items.map(async (item) => {
        const checked = await item.getAttribute('aria-checked');
        return {
          label: (await item.text({ exclude: MENU_ITEM_EXTRA })).trim(),
          disabled: (await item.getAttribute('aria-disabled')) === 'true',
          checked: checked === null ? null : checked === 'true',
          hasSubmenu: (await item.getAttribute('aria-haspopup')) === 'menu',
        };
      }),
    );
  }

  /** Opens the menu and activates the item at `path` (submenus by their labels). */
  async select(...path: string[]): Promise<void> {
    await this.open();
    let id = await this.#menuId();
    for (const [i, label] of path.entries()) {
      const items = await this.documentRootLocatorFactory().locatorForAll(`#${id} [role^="menuitem"]`)();
      let found: TestElement | null = null;
      for (const item of items) if ((await item.text({ exclude: MENU_ITEM_EXTRA })).trim() === label) found = item;
      if (!found) throw new Error(`AuiMenuHarness: no item "${label}".`);
      await found.click();
      if (i < path.length - 1) {
        const controls = await found.getAttribute('aria-controls');
        if (!controls) throw new Error(`AuiMenuHarness: "${label}" has no submenu.`);
        id = controls;
      }
    }
  }

  async #menuId(): Promise<string> {
    const id = await (await this.host()).getAttribute('aria-controls');
    if (!id) throw new Error('AuiMenuHarness: the trigger controls no menu.');
    return id;
  }

  async #menu(): Promise<TestElement> {
    return this.documentRootLocatorFactory().locatorFor(`#${await this.#menuId()}`)();
  }
}
