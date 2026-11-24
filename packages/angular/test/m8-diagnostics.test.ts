import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, type Provider, type EnvironmentProviders } from '@angular/core';
// First: core/testing loads the JIT compiler that partially compiled common/router declarations need.
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { resetAbsoluteUIConfig, type ComponentConfigInput } from '@absoluteui/core';
import type { SidebarItem } from '@absoluteui/components/sidebar';
import { provideAbsoluteUI, provideAbsoluteUIConfig } from '../src/index.js';
import { AUI_DATA_TABLE } from '../src/data-table/index.js';
import { resetDiagnostics } from '../src/internal/diagnostics.js';
import { AuiRouterNav, type AuiRouterItem } from '../src/router/index.js';
import { AuiSidebar } from '../src/sidebar/index.js';
import { AuiTextInput } from '../src/text-input/index.js';

// docs/PLAN-R9-ANGULAR.md M8a item 4 (D27): development diagnostics.
beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {
    // Already initialized by another test file in the same run.
  }
});

let warn: MockInstance<(...data: unknown[]) => void>;
beforeEach(() => {
  resetDiagnostics();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function render(type: new () => unknown, providers: (Provider | EnvironmentProviders)[] = []): Promise<string[]> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' }), ...providers] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return warn.mock.calls.map((args) => args.map(String).join(' ')).filter((m) => m.includes('AbsoluteUI'));
}

interface Row {
  id: string;
  name: string;
}
const ROWS: readonly Row[] = [{ id: 'a', name: 'Ada' }];

describe('development diagnostics (M8a)', () => {
  it('correct usage is silent', async () => {
    @Component({
      imports: [ReactiveFormsModule, AuiTextInput, ...AUI_DATA_TABLE],
      template: `
        <aui-text-input label="Name" [formControl]="name" />
        <aui-text-input label="Nick" [(value)]="nick" />
        <aui-data-table caption="People" [rows]="rows" [rowId]="byId">
          <aui-column field="name" header="Name" />
          <ng-template auiCell="name" [auiCellOf]="rows" let-row>{{ row.name }}</ng-template>
        </aui-data-table>
      `,
    })
    class Clean {
      readonly name = new FormControl('x', { nonNullable: true });
      readonly nick = signal('y');
      readonly rows = ROWS;
      readonly byId = (r: Row): string => r.id;
    }
    expect(await render(Clean, [provideAbsoluteUIConfig({ components: { dataTable: { pageSize: 10 } } })])).toEqual([]);
  });

  it('value binding together with a form directive', async () => {
    @Component({
      imports: [ReactiveFormsModule, AuiTextInput],
      template: `<aui-text-input label="Name" [formControl]="name" [(value)]="mirror" />`,
    })
    class Both {
      readonly name = new FormControl('x', { nonNullable: true });
      readonly mirror = signal('y');
    }
    const messages = await render(Both);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('AUI_NG_VALUE_WITH_FORM');
    expect(messages[0]).toContain('<aui-text-input>');
    // Never the values.
    expect(messages[0]).not.toMatch(/\bx\b|\by\b/);
  });

  it('table templates: unknown column id and a different [auiCellOf] array', async () => {
    @Component({
      imports: [...AUI_DATA_TABLE],
      template: `
        <aui-data-table caption="People" [rows]="rows" [rowId]="byId">
          <aui-column field="name" header="Name" />
          <ng-template auiCell="nmae" let-row>{{ row }}</ng-template>
          <ng-template auiCell="name" [auiCellOf]="other" let-row>{{ row.name }}</ng-template>
        </aui-data-table>
      `,
    })
    class Templates {
      readonly rows = ROWS;
      readonly other: readonly Row[] = [];
      readonly byId = (r: Row): string => r.id;
    }
    const messages = await render(Templates);
    expect(messages.some((m) => m.includes('AUI_NG_TEMPLATE_COLUMN') && m.includes('"nmae"'))).toBe(true);
    expect(messages.some((m) => m.includes('AUI_NG_TEMPLATE_OF'))).toBe(true);
  });

  it('a configuration key that names no component', async () => {
    @Component({ template: '' })
    class Empty {
      readonly empty = true;
    }
    // TypeScript rejects unknown keys written in code; configuration loaded at run time (JSON) is not checked.
    const loaded: unknown = JSON.parse('{"datatable":{"pageSize":10}}');
    const components = loaded as ComponentConfigInput;
    const messages = await render(Empty, [provideAbsoluteUIConfig({ components })]);
    expect(messages).toEqual([expect.stringContaining('AUI_NG_CONFIG_KEY') as string]);
    expect(messages[0]).toContain('components.datatable');
  });

  it('auiRouterNav with a bound value', async () => {
    @Component({
      imports: [AuiSidebar, AuiRouterNav],
      template: `<aui-sidebar auiRouterNav label="Main" [items]="items" [(value)]="active" [breakpoint]="0" />`,
    })
    class Nav {
      readonly items: readonly AuiRouterItem<SidebarItem>[] = [{ id: 'a', label: 'A', routerLink: '/a' }];
      readonly active = signal('a');
    }
    const messages = await render(Nav, [provideRouter([]), provideLocationMocks()]);
    expect(messages).toEqual([expect.stringContaining('AUI_NG_ROUTER_VALUE') as string]);
  });
});
