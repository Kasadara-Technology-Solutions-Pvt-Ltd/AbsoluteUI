/**
 * SSR fixture (docs/PLAN-R9-ANGULAR.md M6, D3). Rendered on the server by
 * scripts/angular-ssr.mjs (Node, @angular/platform-server) and hydrated in the browser by
 * test/m6-ssr.test.ts. One application, so the server output and the client bootstrap match.
 */
import { Component, provideZonelessChangeDetection, signal, type ApplicationConfig } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideRouter, RouterLink, RouterOutlet, type Routes } from '@angular/router';
import { plainDate, type PlainDate } from '@absoluteui/core';
import type { IconOverlayDefinition, IconRef } from '@absoluteui/icons';
import { lockOverlay, spinnerIcon } from '@absoluteui/icons/set';
import type { SidebarItem } from '@absoluteui/components/sidebar';
import { provideAbsoluteUI } from '../../src/index.js';
import { AuiButton, AuiLinkButton } from '../../src/button/index.js';
import { AUI_CARD } from '../../src/card/index.js';
import { AUI_DATA_TABLE } from '../../src/data-table/index.js';
import { AuiDatePicker } from '../../src/date-picker/index.js';
import { AuiDialog } from '../../src/dialog/index.js';
import { AuiIcon } from '../../src/icon/index.js';
import { AuiRouterNav, type AuiRouterItem } from '../../src/router/index.js';
import { AuiSelect } from '../../src/select/index.js';
import { AuiSidebar } from '../../src/sidebar/index.js';
import { AuiTabs } from '../../src/tabs/index.js';
import { AuiTextInput } from '../../src/text-input/index.js';
import { AuiHeading } from '../../src/typography/index.js';

@Component({ selector: 'app-page', template: '<p class="page">{{ title }}</p>' })
export class SsrPage {
  readonly title = 'Page';
}

export const ssrRoutes: Routes = [
  { path: 'people', component: SsrPage },
  { path: 'reports', component: SsrPage },
  { path: '**', component: SsrPage },
];

export interface Person {
  id: string;
  name: string;
  hours: number;
}

@Component({
  selector: 'app-ssr',
  imports: [
    ReactiveFormsModule,
    RouterOutlet,
    RouterLink,
    AuiButton,
    AuiLinkButton,
    ...AUI_CARD,
    ...AUI_DATA_TABLE,
    AuiDatePicker,
    AuiDialog,
    AuiIcon,
    AuiRouterNav,
    AuiSelect,
    AuiSidebar,
    AuiTabs,
    AuiTextInput,
    AuiHeading,
  ],
  template: `
    <aui-sidebar auiRouterNav label="Main" [items]="nav" [collapsible]="false" [breakpoint]="0" />
    <main>
      <h1 class="title" auiHeading size="2">SSR fixture</h1>
      <button type="button" auiButton variant="primary" class="save" (click)="clicks.set(clicks() + 1)">Save {{ clicks() }}</button>
      <a auiButton routerLink="/reports" class="to-reports">Reports</a>
      <aui-icon name="calendar" />
      <aui-icon class="spin" [name]="spinner" variant="duotone" [animation]="{ preset: 'spin' }" animationState="loading" [overlays]="[{ icon: lock }]" />
      <aui-text-input label="Name" [formControl]="name" />
      <aui-date-picker label="Start" [(value)]="start" />
      <aui-select label="Team" [options]="teams" [(value)]="team" />
      <aui-tabs label="Views" [tabs]="tabs" [(value)]="tab" />
      <aui-card title="Summary">
        <aui-card-content><span class="card-body">Projected {{ clicks() }}</span></aui-card-content>
      </aui-card>
      <aui-data-table caption="People" [rows]="people" [rowId]="byId">
        <aui-column field="name" header="Name" rowHeader>
          <ng-template auiCell [auiCellOf]="people" let-row><strong class="cell-name">{{ row.name }}</strong></ng-template>
        </aui-column>
        <aui-column field="hours" header="Hours" type="number" />
      </aui-data-table>
      <aui-dialog title="Confirm" [(open)]="dialogOpen"><p class="dialog-body">Sure?</p></aui-dialog>
      <router-outlet />
    </main>
  `,
})
export class SsrApp {
  readonly spinner: IconRef = spinnerIcon;
  readonly lock: IconOverlayDefinition = lockOverlay;
  readonly clicks = signal(0);
  readonly name = new FormControl('Ada', { nonNullable: true });
  readonly start = signal<PlainDate | null>(plainDate(2026, 3, 8));
  readonly team = signal<string | undefined>('core');
  readonly tab = signal<string | undefined>('list');
  readonly dialogOpen = signal(false);
  readonly nav: readonly AuiRouterItem<SidebarItem>[] = [
    { id: 'people', label: 'People', routerLink: '/people' },
    { id: 'reports', label: 'Reports', routerLink: '/reports' },
  ];
  readonly teams = [
    { value: 'core', label: 'Core' },
    { value: 'web', label: 'Web' },
  ];
  readonly tabs = [
    { id: 'list', label: 'List', content: 'List view' },
    { id: 'grid', label: 'Grid', content: 'Grid view' },
  ];
  readonly people: readonly Person[] = [
    { id: 'p1', name: 'Ada', hours: 3 },
    { id: 'p2', name: 'Lin', hours: 5 },
  ];
  readonly byId = (p: Person): string => p.id;
}

/** Providers shared by the server render and the browser bootstrap. */
export const ssrConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideRouter(ssrRoutes), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US', timezone: 'UTC' })],
};
