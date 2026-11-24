import { Component } from '@angular/core';
import { AuiGantt } from '@absoluteui/angular/gantt';
import type { GanttDependency, GanttTask, GanttTaskChangeDetail } from '@absoluteui/components/gantt';
import { plainDate } from '@absoluteui/core';

const start = plainDate(2026, 11, 2);

@Component({
  selector: 'app-launch-plan',
  imports: [AuiGantt],
  template: `
    <aui-gantt label="Product launch" [tasks]="tasks" [dependencies]="dependencies" [calendar]="calendar"
      [editable]="true" [showCritical]="true" [columns]="['name', 'start', 'end', 'duration', 'progress']" (taskChange)="changed($event)" />
  `,
})
export class LaunchPlanComponent {
  /** Durations count business days: weekends and holidays are skipped when scheduling. */
  readonly calendar = { holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }] };
  tasks: GanttTask[] = [
    { id: 'research', parentId: null, label: 'User research', start, duration: 5, progress: 100 },
    { id: 'spec', parentId: null, label: 'Specification', start, duration: 4, progress: 60 },
    { id: 'ui', parentId: null, label: 'User interface', start, duration: 10, progress: 20 },
    { id: 'launch', parentId: null, label: 'Launch', start, duration: 0 },
  ];
  readonly dependencies: GanttDependency[] = [
    { id: 'd1', from: 'research', to: 'spec' },
    { id: 'd2', from: 'spec', to: 'ui' },
    { id: 'd3', from: 'ui', to: 'launch', lag: 1 },
  ];

  changed(detail: GanttTaskChangeDetail): void {
    this.tasks = detail.tasks;
  }
}
