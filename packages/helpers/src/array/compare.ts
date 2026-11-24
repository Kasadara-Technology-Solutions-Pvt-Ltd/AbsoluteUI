/**
 * Internal value ordering shared by `sortBy`, `topN`, `binarySearch`, and the `*By` aggregates.
 * Nullish, `NaN`, and invalid dates are "empty" and sort together; other types order by a fixed type rank.
 */

/** Rank: 0 empty, 1 boolean, 2 number/bigint, 3 string, 4 date, 5 anything else. */
function rank(v: unknown): number {
  if (v === null || v === undefined) return 0;
  switch (typeof v) {
    case 'boolean':
      return 1;
    case 'number':
      return Number.isNaN(v) ? 0 : 2;
    case 'bigint':
      return 2;
    case 'string':
      return 3;
    default:
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? 0 : 4;
      return 5;
  }
}

/** True for values that sort as empty (nullish, `NaN`, invalid `Date`). */
export function isEmptyKey(v: unknown): boolean {
  return rank(v) === 0;
}

/** Total order over mixed values; strings compare by UTF-16 code units unless a collator is given. */
export function compareNatural(a: unknown, b: unknown, collator?: Intl.Collator): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 0:
    case 5:
      return 0;
    case 3:
      return collator ? collator.compare(a as string, b as string) : a === b ? 0 : (a as string) < (b as string) ? -1 : 1;
    case 4:
      return (a as Date).getTime() - (b as Date).getTime();
    default: {
      const x = a as number | bigint | boolean;
      const y = b as number | bigint | boolean;
      return x === y ? 0 : x < y ? -1 : x > y ? 1 : 0;
    }
  }
}
