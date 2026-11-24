import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
// After the testing platform, which loads the compiler that @angular/common declarations need here.
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { parseInstant, parseRecurrenceRule, plainDate, recurrenceRuleToString, resetAbsoluteUIConfig, type RecurrenceRule } from '@absoluteui/core';
import type { BusinessCalendarChangeDetail } from '@absoluteui/components/business-calendar';
import type { SchedulerEvent, SchedulerEventActivateDetail } from '@absoluteui/components/scheduler';
import type { ScheduleValue } from '@absoluteui/components/schedule-picker';
import { AuiBusinessCalendar } from '../src/business-calendar/index.js';
import { AuiRecurrencePicker } from '../src/recurrence-picker/index.js';
import { AuiSchedulePicker } from '../src/schedule-picker/index.js';
import { AuiScheduler } from '../src/scheduler/index.js';

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

const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
  }
};

const start = parseInstant('2026-09-29T08:00:00Z')!;
const end = parseInstant('2026-09-29T09:00:00Z')!;

@Component({
  imports: [AuiScheduler, AuiBusinessCalendar],
  template: `
    <aui-scheduler label="Team" [events]="events" [date]="date" timezone="UTC" view="day" (eventActivated)="opened.set($event.event.id)"></aui-scheduler>
    <aui-business-calendar label="Office" [months]="1" [editable]="true" [focusedDate]="date" (changed)="changed.set($event)"></aui-business-calendar>
  `,
})
class SchedulerHost {
  readonly events: SchedulerEvent[] = [{ id: 'e1', title: 'Review', start, end }];
  readonly date = plainDate(2026, 9, 29);
  readonly opened = signal<SchedulerEventActivateDetail['event']['id'] | null>(null);
  readonly changed = signal<BusinessCalendarChangeDetail | null>(null);
}

@Component({
  imports: [ReactiveFormsModule, AuiRecurrencePicker, AuiSchedulePicker],
  template: `
    <aui-recurrence-picker label="Repeat" [formControl]="rule"></aui-recurrence-picker>
    <aui-schedule-picker label="When" [formControl]="when"></aui-schedule-picker>
  `,
})
class FormHost {
  readonly rule = new FormControl<RecurrenceRule | null>(parseRecurrenceRule('FREQ=WEEKLY;BYDAY=TU'));
  readonly when = new FormControl<ScheduleValue | null>({ allDay: false, start, end, timeZone: 'UTC', recurrence: null });
}

describe('Angular adapter: R3 phase 3a', () => {
  it('scheduler renders events and forwards aui-event-activate; business calendar emits edits', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(SchedulerHost);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const event = el.querySelector<HTMLElement>('.aui-scheduler button[data-aui-key="e1"]');
    expect(event?.getAttribute('aria-label')).toContain('Review');
    event?.click();
    await settle(fixture);
    expect(fixture.componentInstance.opened()).toBe('e1');
    el.querySelector<HTMLElement>('.aui-business-calendar td[tabindex="0"]')?.click();
    await settle(fixture);
    expect(fixture.componentInstance.changed()?.working).toBe(false);
  });

  it('recurrence and schedule pickers bind to reactive forms', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(FormHost);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLSelectElement>('.aui-recurrence-picker__frequency')?.value).toBe('weekly');
    fixture.componentInstance.rule.setValue(parseRecurrenceRule('FREQ=DAILY'));
    await settle(fixture);
    expect(el.querySelector<HTMLSelectElement>('.aui-recurrence-picker__frequency')?.value).toBe('daily');
    const monday = el.querySelectorAll<HTMLSelectElement>('.aui-recurrence-picker__frequency')[0];
    if (monday) {
      monday.value = 'monthly';
      monday.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await settle(fixture);
    const value = fixture.componentInstance.rule.value;
    expect(value && recurrenceRuleToString(value)).toMatch(/^RRULE:FREQ=MONTHLY/);
    expect(el.querySelector('.aui-schedule-picker__duration')?.textContent).toContain('1 hr');
    expect(fixture.componentInstance.when.valid).toBe(true);
  });
});
