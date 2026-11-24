import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BinaryHeap, CircularBuffer, Deque, LinkedList, PriorityQueue, Queue, Stack, naturalCompare } from '@absoluteui/helpers/ds';
import { ValidationError } from '@absoluteui/helpers/error';

describe('Stack', () => {
  it('is LIFO and iterates top first', () => {
    const s = new Stack([1, 2]);
    s.push(3);
    expect(s.size).toBe(3);
    expect(s.peek()).toBe(3);
    expect([...s]).toEqual([3, 2, 1]);
    expect(s.toArray()).toEqual([3, 2, 1]);
    expect(s.pop()).toBe(3);
    s.clear();
    expect(s.isEmpty()).toBe(true);
    expect(s.pop()).toBeUndefined();
  });
});

describe('Deque', () => {
  it('matches an array model under random operations (property)', () => {
    type Op = { t: 'push' | 'unshift'; v: number } | { t: 'pop' | 'shift' | 'at'; v: number };
    const op = fc.oneof(
      fc.record({ t: fc.constantFrom('push' as const, 'unshift' as const), v: fc.integer() }),
      fc.record({ t: fc.constantFrom('pop' as const, 'shift' as const, 'at' as const), v: fc.integer({ min: -40, max: 40 }) }),
    );
    fc.assert(
      fc.property(fc.array(op as fc.Arbitrary<Op>, { maxLength: 300 }), (ops) => {
        const d = new Deque<number>();
        const model: number[] = [];
        for (const o of ops) {
          switch (o.t) {
            case 'push': d.push(o.v); model.push(o.v); break;
            case 'unshift': d.unshift(o.v); model.unshift(o.v); break;
            case 'pop': expect(d.pop()).toBe(model.pop()); break;
            case 'shift': expect(d.shift()).toBe(model.shift()); break;
            case 'at': expect(d.at(o.v)).toBe(model.at(o.v)); break;
          }
          expect(d.size).toBe(model.length);
        }
        expect(d.toArray()).toEqual(model);
        expect(d.peekFront()).toBe(model[0]);
        expect(d.peekBack()).toBe(model.at(-1));
      }),
    );
  });

  it('grows past many wraps and handles 1e5 items quickly', () => {
    const d = new Deque<number>();
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) {
      d.push(i);
      if (i % 3 === 0) d.shift();
    }
    expect(d.size).toBe(66_666);
    expect(performance.now() - t0).toBeLessThan(1000);
    d.clear();
    expect(d.size).toBe(0);
    expect(d.at(1.5)).toBeUndefined();
  });
});

describe('Queue', () => {
  it('is FIFO', () => {
    const q = new Queue(['a']);
    q.enqueue('b').enqueue('c');
    expect(q.peek()).toBe('a');
    expect(q.dequeue()).toBe('a');
    expect([...q]).toEqual(['b', 'c']);
    expect(q.toArray()).toEqual(['b', 'c']);
    q.clear();
    expect(q.dequeue()).toBeUndefined();
    expect(q.isEmpty()).toBe(true);
  });
});

describe('CircularBuffer', () => {
  it('overwrites the oldest when full', () => {
    const b = new CircularBuffer<number>(3);
    expect(b.push(1)).toBeUndefined();
    b.push(2);
    b.push(3);
    expect(b.isFull()).toBe(true);
    expect(b.push(4)).toBe(1);
    expect(b.toArray()).toEqual([2, 3, 4]);
    expect(b.at(0)).toBe(2);
    expect(b.at(-1)).toBe(4);
    expect(b.shift()).toBe(2);
    expect(b.pop()).toBe(4);
    expect([...b]).toEqual([3]);
    b.clear();
    expect(b.size).toBe(0);
    expect(b.capacity).toBe(3);
  });

  it('matches a sliding-window model (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.array(fc.integer(), { maxLength: 100 }), (cap, items) => {
        const b = new CircularBuffer<number>(cap);
        for (const i of items) b.push(i);
        expect(b.toArray()).toEqual(items.slice(-cap));
      }),
    );
  });

  it('validates capacity', () => {
    expect(() => new CircularBuffer(0)).toThrow(ValidationError);
    expect(() => new CircularBuffer(1.5)).toThrow(ValidationError);
  });
});

describe('BinaryHeap / PriorityQueue', () => {
  it('pops in sorted order (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.array(fc.integer()), (initial, pushed) => {
        const h = new BinaryHeap(initial);
        for (const p of pushed) h.push(p);
        const all = [...initial, ...pushed].sort((a, b) => a - b);
        expect(h.toSortedArray()).toEqual(all);
        expect([...h.drain()]).toEqual(all);
        expect(h.size).toBe(0);
      }),
    );
  });

  it('replace, remove, peek, custom comparer', () => {
    const pq = new PriorityQueue<{ p: number; id: string }>([], (a, b) => b.p - a.p);
    pq.push({ p: 1, id: 'low' }).push({ p: 5, id: 'high' }).push({ p: 3, id: 'mid' });
    expect(pq.peek()?.id).toBe('high');
    expect(pq.replace({ p: 4, id: 'four' })?.id).toBe('high');
    expect(pq.pop()?.id).toBe('four');
    const h = BinaryHeap.from([5, 3, 8, 1, 9, 2]);
    expect(h.remove(8)).toBe(true);
    expect(h.remove(100)).toBe(false);
    expect([...h.drain()]).toEqual([1, 2, 3, 5, 9]);
    expect(h.pop()).toBeUndefined();
    expect(h.replace(7)).toBeUndefined();
    expect(h.toArray()).toEqual([7]);
    expect([...h]).toEqual([7]);
    h.clear();
    expect(h.isEmpty()).toBe(true);
  });

  it('remove keeps heap order (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1 }), fc.nat(), (items, pick) => {
        const h = new BinaryHeap(items);
        const target = items[pick % items.length]!;
        h.remove(target);
        const model = items.slice();
        model.splice(model.indexOf(target), 1);
        expect([...h.drain()]).toEqual(model.sort((a, b) => a - b));
      }),
    );
  });

  it('heapifies 1e5 items and orders strings and dates naturally', () => {
    const big = Array.from({ length: 100_000 }, (_, i) => (i * 7919) % 100_003);
    const h = new BinaryHeap(big);
    expect(h.pop()).toBe(Math.min(...big));
    expect(new BinaryHeap(['b', 'a', 'c']).pop()).toBe('a');
    expect(new BinaryHeap([new Date(2), new Date(1)]).pop()?.getTime()).toBe(1);
    expect(() => naturalCompare({}, {})).toThrow(ValidationError);
    expect([3, Number.NaN, 1].sort(naturalCompare)).toEqual([1, 3, Number.NaN]);
  });
});

describe('LinkedList', () => {
  it('supports O(1) node operations', () => {
    const list = new LinkedList([1, 3]);
    const one = list.find((v) => v === 1)!;
    const two = list.insertAfter(one, 2);
    list.insertBefore(one, 0);
    list.unshift(-1);
    list.push(4);
    expect(list.toArray()).toEqual([-1, 0, 1, 2, 3, 4]);
    expect(list.remove(two)).toBe(2);
    expect(list.pop()).toBe(4);
    expect(list.shift()).toBe(-1);
    expect(list.size).toBe(3);
    expect(list.head?.value).toBe(0);
    expect(list.tail?.value).toBe(3);
    list.reverse();
    expect([...list]).toEqual([3, 1, 0]);
    expect([...list.nodes()].map((n) => n.value)).toEqual([3, 1, 0]);
    expect(list.head?.next?.value).toBe(1);
    expect(list.tail?.prev?.value).toBe(1);
  });

  it('rejects foreign or removed nodes', () => {
    const a = new LinkedList([1]);
    const b = new LinkedList([2]);
    expect(() => a.remove(b.head!)).toThrow(ValidationError);
    const n = a.head!;
    a.remove(n);
    expect(() => a.remove(n)).toThrow(ValidationError);
    expect(() => a.insertAfter({ value: 1, prev: undefined, next: undefined }, 2)).toThrow(ValidationError);
    const c = new LinkedList([1, 2]);
    const h = c.head!;
    c.clear();
    expect(c.isEmpty()).toBe(true);
    expect(() => c.remove(h)).toThrow(ValidationError);
    expect(c.pop()).toBeUndefined();
    expect(c.shift()).toBeUndefined();
  });

  it('matches an array model (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom('push', 'unshift', 'pop', 'shift', 'reverse'), fc.integer()), { maxLength: 200 }), (ops) => {
        const list = new LinkedList<number>();
        const model: number[] = [];
        for (const [op, v] of ops) {
          if (op === 'push') { list.push(v); model.push(v); }
          else if (op === 'unshift') { list.unshift(v); model.unshift(v); }
          else if (op === 'pop') expect(list.pop()).toBe(model.pop());
          else if (op === 'shift') expect(list.shift()).toBe(model.shift());
          else { list.reverse(); model.reverse(); }
        }
        expect(list.toArray()).toEqual(model);
        expect(list.size).toBe(model.length);
      }),
    );
  });
});
