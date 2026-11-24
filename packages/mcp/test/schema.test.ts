import { describe, expect, it } from 'vitest';
import { assertSupportedSchema, formatErrors, jsonEqual, MAX_INSTANCE_DEPTH, validate } from '../src/protocol/schema.js';
import type { JsonObject, JsonValue } from '../src/protocol/jsonrpc.js';

const searchSchema: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 10 },
    kinds: { type: 'array', items: { enum: ['component', 'guide'] }, uniqueItems: true, maxItems: 2 },
    limit: { type: 'integer', minimum: 1, maximum: 25 },
    name: { type: 'string', pattern: '^[a-z][a-z-]*$' },
  },
};

describe('schema validator', () => {
  it('accepts a conforming instance', () => {
    expect(validate(searchSchema, { query: 'grid', kinds: ['component'], limit: 5, name: 'data-grid' })).toEqual([]);
  });

  it('reports each violation with a JSON Pointer', () => {
    const errors = validate(searchSchema, { kinds: ['component', 'component', 'x'], limit: 1.5, extra: true });
    expect(errors.map((e) => `${e.path} ${e.message}`)).toEqual([
      ' must have the property "query"',
      '/kinds must have at most 2 items',
      '/limit must be of type integer',
      ' must not have the property "extra"',
    ]);
  });

  it('counts string length in code points and checks patterns, enums, and bounds', () => {
    expect(validate(searchSchema, { query: '😀'.repeat(10) })).toEqual([]);
    expect(validate(searchSchema, { query: 'x'.repeat(11) })[0]?.message).toBe('must have at most 10 characters');
    expect(validate(searchSchema, { query: 'a', name: 'Bad' })[0]?.path).toBe('/name');
    expect(validate(searchSchema, { query: 'a', kinds: ['other'] })[0]?.path).toBe('/kinds/0');
    expect(validate(searchSchema, { query: 'a', limit: 26 })[0]?.message).toBe('must be at most 25');
  });

  it('supports anyOf, oneOf, allOf, const, and boolean schemas', () => {
    const schema: JsonObject = { anyOf: [{ type: 'string' }, { type: 'integer' }] };
    expect(validate(schema, 'a')).toEqual([]);
    expect(validate(schema, true)).toHaveLength(1);
    expect(validate({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 3)).toHaveLength(1);
    expect(validate({ allOf: [{ type: 'number' }, { minimum: 2 }] }, 1)).toHaveLength(1);
    expect(validate({ const: { a: [1] } }, { a: [1] })).toEqual([]);
    expect(validate(false, 1)).toHaveLength(1);
    expect(validate(true, 1)).toEqual([]);
  });

  it('bounds recursion over deeply nested input', () => {
    let value: JsonValue = 'leaf';
    for (let i = 0; i < MAX_INSTANCE_DEPTH + 5; i++) value = [value];
    let schema: JsonObject = {};
    for (let i = 0; i < MAX_INSTANCE_DEPTH + 5; i++) schema = { type: 'array', items: schema };
    expect(validate(schema, value).some((e) => e.message.includes('nested deeper'))).toBe(true);
  });

  it('rejects unsupported keywords at registration', () => {
    expect(() => { assertSupportedSchema({ type: 'object', $ref: 'https://example.com/s' }); }).toThrow(/only local references/);
    expect(() => { assertSupportedSchema({ type: 'object', patternProperties: {} }); }).toThrow(/unsupported keyword "patternProperties"/);
    expect(() => { assertSupportedSchema({ type: 'thing' }); }).toThrow(/unknown type/);
    expect(() => { assertSupportedSchema(searchSchema); }).not.toThrow();
  });

  it('resolves local references and reports missing ones', () => {
    const schema: JsonObject = { $defs: { Name: { type: 'string', minLength: 2 } }, type: 'object', properties: { name: { $ref: '#/$defs/Name' }, other: { $ref: '#/$defs/Missing' } } };
    expect(validate(schema, { name: 'ok' })).toEqual([]);
    expect(validate(schema, { name: 'x' })).toEqual([{ path: '/name', message: 'must have at least 2 characters' }]);
    expect(validate(schema, { other: 1 })).toEqual([{ path: '/other', message: 'refers to the missing schema #/$defs/Missing' }]);
  });

  it('stops a reference cycle that consumes no input', () => {
    const schema: JsonObject = { $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } }, $ref: '#/$defs/A' };
    expect(validate(schema, 1).some((e) => e.message.includes('nested deeper'))).toBe(true);
  });

  it('formats at most five errors into one sentence', () => {
    const errors = Array.from({ length: 7 }, (_, i) => ({ path: `/${i}`, message: 'is wrong' }));
    expect(formatErrors(errors)).toBe('Invalid arguments: arguments/0 is wrong; arguments/1 is wrong; arguments/2 is wrong; arguments/3 is wrong; arguments/4 is wrong (and 2 more).');
  });

  it('compares JSON values structurally', () => {
    expect(jsonEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual([1], { 0: 1 })).toBe(false);
  });
});
