/**
 * Schema builders, re-exported as the `v` namespace from `@absoluteui/helpers/validate`
 * (`v.string()`, `v.object()`, ...). Each builder is a standalone function, so bundlers drop
 * the ones an app does not use.
 */
export { string, number, boolean, date, literal, enumOf, array, object, optional, nullable, union, refine, transform } from './schema.js';
