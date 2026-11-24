import { afterEach, describe, expect, it } from 'vitest';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid } from '@absoluteui/components/data-grid';
import { applyState, dataGridStateSchema, describeState } from '@absoluteui/components/data-grid/schema';

// docs/PLAN-R11-G10.md (G10e): the view state schema for tools.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface E {
  id: string;
  name: string;
  dept: string;
  salary: number;
}
const staff: E[] = [
  { id: '1', name: 'Ada', dept: 'Eng', salary: 10 },
  { id: '2', name: 'Ben', dept: 'Ops', salary: 7 },
  { id: '3', name: 'Cy', dept: 'Eng', salary: 4 },
];

function mount(): DataGrid<E> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<E>(host, {
    label: 'Staff',
    locale: 'en-US',
    rows: staff,
    rowId: (r) => r.id,
    columns: [
      { id: 'name', header: 'Name', field: 'name', filter: 'text' },
      { id: 'work', header: 'Work', children: [{ id: 'dept', header: 'Department', field: 'dept', filter: 'set', groupable: true }] },
      { id: 'salary', header: 'Salary', field: 'salary', type: 'number', filter: 'number', sortable: false },
    ],
  });
}

describe('view state schema (G10e)', () => {
  it('describes the real columns, filter kinds, groups, and pivot aggregates', () => {
    const schema = dataGridStateSchema(mount()) as { properties: Record<string, { properties?: Record<string, unknown>; items?: unknown; oneOf?: unknown[] }>; $schema: string; description: string };
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.description).toContain('salary ("Salary", number, number filter)');
    expect(schema.properties.sort?.items).toMatchObject({ properties: { column: { enum: ['name', 'dept'] } } });
    expect(schema.properties.groupBy?.items).toEqual({ enum: ['dept'] });
    expect(Object.keys(schema.properties.filters?.properties ?? {})).toEqual(['name', 'dept', 'salary']);
    expect(schema.properties.filters?.properties?.dept).toMatchObject({ properties: { kind: { const: 'set' } } });
    expect(schema.properties.columns?.properties?.collapsedGroups).toMatchObject({ items: { enum: ['work'] } });
    expect(JSON.stringify(schema.properties.pivot)).toContain('distinctCount');
    // Plain JSON: it round-trips.
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it('applies a proposed state or returns the validation message; describes the view in a sentence or two', () => {
    const g = mount();
    expect(applyState(g, { sort: [{ column: 'name', direction: 'descending' }], filters: { salary: { kind: 'number', conditions: [{ operator: 'greaterThan', value: 5 }] } }, groupBy: ['dept'] })).toEqual({ ok: true });
    expect(describeState(g)).toBe('Staff: 2 rows match. Sorted by Name descending. Filtered on Salary. Grouped by Department.');
    const bad = applyState(g, { sort: [{ column: 'name', direction: 'sideways' }] });
    expect(bad.ok).toBe(false);
    expect(bad.ok ? '' : bad.error).toMatch(/dataGrid\.state\.sort/);
    expect(g.getState().sort).toEqual([{ column: 'name', direction: 'descending' }]);
  });
});
