import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { instant, plainDate, plainDateToString, resetAbsoluteUIConfig, type Instant, type PlainDate, type Range } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import type { ComboboxOption } from '@absoluteui/components/combobox';
import type { SelectOption } from '@absoluteui/components/select';
import { provideAbsoluteUI, provideAbsoluteUIConfig } from '../src/index.js';
import { AuiCombobox } from '../src/combobox/index.js';
import { AuiDatePicker } from '../src/date-picker/index.js';
import { AuiDateRangePicker } from '../src/date-range-picker/index.js';
import { AuiDateTimePicker } from '../src/date-time-picker/index.js';
import { AuiSelect } from '../src/select/index.js';
import { AuiItem, AuiSelectedItem } from '../src/templates/index.js';

// docs/PLAN-R9-ANGULAR.md M4: date/time with time zones, DST, business calendar; Select and Combobox templates, async options.
beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {
    // Already initialized by another test file in the same run.
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

const at = (iso: string): Instant => instant(Date.parse(iso));
const segmentValues = (host: Element): string[] => Array.from(host.querySelectorAll<HTMLInputElement>('.aui-date-input__segment')).map((s) => s.value);

@Component({
  selector: 'test-new-york',
  imports: [ReactiveFormsModule, AuiDateTimePicker],
  providers: [provideAbsoluteUIConfig({ timezone: 'America/New_York', disambiguation: 'reject' })],
  template: `<aui-date-time-picker class="ny" label="Departure" [formControl]="departure"></aui-date-time-picker>`,
})
class NewYorkScope {
  /** A server UTC value: 07:30Z on the US spring-forward day is 03:30 EDT. */
  readonly departure = new FormControl<Instant | null>(at('2026-03-08T07:30:00Z'));
}

@Component({
  imports: [ReactiveFormsModule, AuiDateTimePicker, AuiDatePicker, AuiDateRangePicker, NewYorkScope],
  template: `
    <aui-date-time-picker class="utc" label="Departure" [formControl]="utc"></aui-date-time-picker>
    <aui-date-time-picker class="kolkata" label="Departure" timezone="Asia/Kolkata" [formControl]="utc"></aui-date-time-picker>
    <test-new-york />
    <aui-date-picker class="leap" label="Day" [formControl]="leap" [businessCalendar]="business" disableNonWorking></aui-date-picker>
    <aui-date-range-picker class="range" label="Trip" [formControl]="trip"></aui-date-range-picker>
  `,
})
class DateHost {
  readonly utc = new FormControl<Instant | null>(at('2026-03-08T07:30:00Z'));
  readonly leap = new FormControl<PlainDate | null>(plainDate(2028, 2, 29));
  readonly trip = new FormControl<Range<PlainDate> | null>({ start: plainDate(2026, 3, 7), end: plainDate(2026, 3, 9) });
  readonly business = createBusinessCalendar({ holidays: [{ date: plainDate(2028, 3, 1), name: 'Founders day' }] });
}

describe('date and time (M4)', () => {
  it('shows one server UTC value in the default zone, a scoped zone, and an input zone', async () => {
    const f = await render(DateHost);
    const el = f.nativeElement as HTMLElement;
    // Default time zone is UTC (never the host zone).
    expect(segmentValues(el.querySelector('.utc')!)).toEqual(['03', '08', '2026', '07', '30', 'AM']);
    // Input override.
    expect(segmentValues(el.querySelector('.kolkata')!)).toEqual(['03', '08', '2026', '01', '00', 'PM']);
    // Scoped configuration: New York after the DST jump (03:30 EDT, not 02:30).
    expect(segmentValues(el.querySelector('.ny')!)).toEqual(['03', '08', '2026', '03', '30', 'AM']);
  });

  it("a nonexistent local time is an error under a scoped 'reject' and reaches the form", async () => {
    const f = await render(DateHost);
    const host = (f.nativeElement as HTMLElement).querySelector('.ny')!;
    const scope = f.debugElement.query((d) => d.componentInstance instanceof NewYorkScope).componentInstance as NewYorkScope;
    await userEvent.click(host.querySelector('.aui-date-time-picker__button')!);
    const option = Array.from(host.querySelectorAll<HTMLElement>('.aui-date-time-picker__listbox [role="option"]')).find((o) => o.textContent === '2:30 AM')!;
    await userEvent.click(option);
    await f.whenStable();
    expect(scope.departure.value).toBeNull();
    expect(scope.departure.errors).toMatchObject({ aui: { error: 'nonexistent-time' } });
  });

  it('leap day, business calendar via inputs, and a range across DST keep plain dates', async () => {
    const f = await render(DateHost);
    const el = f.nativeElement as HTMLElement;
    expect(segmentValues(el.querySelector('.leap')!)).toEqual(['02', '29', '2028']);
    const leap = el.querySelector('.leap')!;
    await userEvent.click(leap.querySelector('button')!);
    // The calendar shows February 2028; move to March to see the holiday.
    expect(leap.querySelector('td[aria-label="Tuesday, February 29, 2028"]')).not.toBeNull();
    await userEvent.keyboard('{PageDown}');
    const holiday = leap.querySelector('td[aria-label="Wednesday, March 1, 2028, Founders day, non-working day"]');
    expect(holiday?.getAttribute('aria-disabled')).toBe('true');
    // The range crossing the US DST change stays three calendar days.
    const trip = f.componentInstance.trip.value!;
    expect([plainDateToString(trip.start), plainDateToString(trip.end)]).toEqual(['2026-03-07', '2026-03-09']);
    expect(segmentValues(el.querySelector('.range')!)).toEqual(['03', '07', '2026', '03', '09', '2026']);
  });
});

const COUNTRIES: SelectOption[] = [
  { value: 'in', label: 'India' },
  { value: 'de', label: 'Germany' },
];

@Component({
  imports: [ReactiveFormsModule, AuiSelect, AuiCombobox, AuiItem, AuiSelectedItem],
  template: `
    <aui-select class="country" label="Country" [options]="countries" [formControl]="country">
      <ng-template auiItem [auiItemOf]="countries" let-c><span class="opt">{{ c.value.toUpperCase() }} - {{ c.label }}</span></ng-template>
      <ng-template auiSelectedItem [auiSelectedItemOf]="countries" let-c><span class="sel">{{ c.label }} ({{ c.value }})</span></ng-template>
    </aui-select>
    <aui-combobox class="person" label="Person" [options]="known" [loadOptions]="search" [loadDelay]="0" [formControl]="person">
      <ng-template auiItem [auiItemOf]="known" let-p><i class="person-opt">{{ p.label }}</i></ng-template>
    </aui-combobox>
  `,
})
class SelectHost {
  readonly countries = COUNTRIES;
  readonly country = new FormControl<string | null>('in');
  readonly known: ComboboxOption[] = [];
  readonly person = new FormControl<string | null>(null);
  readonly queries = signal<string[]>([]);
  readonly search = (query: string): Promise<ComboboxOption[]> => {
    this.queries.update((q) => [...q, query]);
    return Promise.resolve([
      { value: 'ada', label: 'Ada Lovelace' },
      { value: 'grace', label: 'Grace Hopper' },
    ].filter((p) => p.label.toLowerCase().includes(query.toLowerCase())));
  };
}

describe('Select and Combobox (M4)', () => {
  it('option and selected-item templates; the label stays the accessible name', async () => {
    const f = await render(SelectHost);
    const el = f.nativeElement as HTMLElement;
    const select = el.querySelector('.country')!;
    expect(select.querySelector('.sel')!.textContent).toBe('India (in)');
    expect(Array.from(select.querySelectorAll('.opt')).map((o) => o.textContent)).toEqual(['IN - India', 'DE - Germany']);
    expect(select.querySelector('[role="option"]')!.getAttribute('aria-label')).toBe('India');
    f.componentInstance.country.setValue('de');
    await f.whenStable();
    expect(select.querySelector('.sel')!.textContent).toBe('Germany (de)');
  });

  it('Combobox loads options as the user types and binds the chosen value', async () => {
    const f = await render(SelectHost);
    const el = f.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('.person input')!;
    await userEvent.click(input);
    await userEvent.keyboard('gr');
    await vi.waitFor(() => {
      expect(Array.from(el.querySelectorAll('.person .person-opt')).map((o) => o.textContent)).toEqual(['Grace Hopper']);
    });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(f.componentInstance.person.value).toBe('grace');
    expect(f.componentInstance.queries().at(-1)).toBe('gr');
  });
});
