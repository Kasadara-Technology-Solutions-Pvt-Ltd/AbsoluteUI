/**
 * Lazy LINQ (docs/PLAN-HELPERS.md section 2, decision 4): pipeable operators for tree-shaking
 * (`pipe(src, where(p), select(f), toArray())`) and the fluent `from(src)` wrapper.
 */
export * from './operators.js';
export { Enumerable, EnumerableGrouping, OrderedEnumerable, empty, from, range, repeat } from './enumerable.js';
