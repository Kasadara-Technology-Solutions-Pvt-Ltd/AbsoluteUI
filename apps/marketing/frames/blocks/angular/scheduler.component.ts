import { Component } from '@angular/core';
import { AuiScheduler } from '@absoluteui/angular/scheduler';
import type { BusinessCalendarDefinition } from '@absoluteui/components/business-calendar';
import type { SchedulerEvent, SchedulerEventChangeDetail } from '@absoluteui/components/scheduler';
import { plainDate, plainTime } from '@absoluteui/core';

@Component({
  selector: 'app-team-calendar',
  imports: [AuiScheduler],
  template: `
    <aui-scheduler label="Team calendar" [events]="events" [editable]="true" view="week" timezone="Asia/Kolkata"
      [businessCalendar]="calendar" [date]="today" [dayStartHour]="8" (eventChange)="changed($event)" />
  `,
})
export class TeamCalendarComponent {
  /** Working days and hours, and holidays: non-working time is shaded. */
  readonly calendar: BusinessCalendarDefinition = {
    workingDays: [1, 2, 3, 4, 5],
    hours: [{ start: plainTime(9, 0), end: plainTime(18, 0) }],
    holidays: [{ date: plainDate(2026, 10, 2), name: 'Gandhi Jayanti', yearly: true }],
  };
  readonly today = plainDate(2026, 10, 27);
  /** Load events from your API; the TypeScript tab shows sample events, including a recurring standup. */
  events: SchedulerEvent[] = [];

  changed(detail: SchedulerEventChangeDetail): void {
    this.events = detail.events;
  }
}
