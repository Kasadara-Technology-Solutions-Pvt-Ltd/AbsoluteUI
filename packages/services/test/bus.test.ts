import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCrossTabBus, createEventBus, createLeaderElection } from '@absoluteui/services/bus';

interface Events extends Record<string, unknown> {
  saved: { id: number };
  closed: undefined;
}

const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createEventBus', () => {
  it('delivers typed events, supports once, off and wildcard', () => {
    const bus = createEventBus<Events>();
    const seen: unknown[] = [];
    const off = bus.on('saved', (p) => seen.push(p.id));
    bus.once('closed', () => seen.push('closed'));
    bus.on('*', (type, payload) => seen.push(`*${type}:${payload === undefined ? '' : JSON.stringify(payload)}`));
    bus.emit('saved', { id: 1 });
    bus.emit('closed', undefined);
    bus.emit('closed', undefined);
    off();
    bus.emit('saved', { id: 2 });
    expect(seen).toEqual([1, '*saved:{"id":1}', 'closed', '*closed:', '*closed:', '*saved:{"id":2}']);
    expect(bus.listenerCount('saved')).toBe(0);
    expect(bus.listenerCount()).toBe(1);
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
    expect(() => {
      bus.emit('*' as 'saved', { id: 1 });
    }).toThrow();
  });

  it('isolates listener errors', () => {
    const errors: string[] = [];
    const bus = createEventBus<Events>({ onError: (e, type) => errors.push(`${type}:${(e as Error).message}`) });
    const seen: number[] = [];
    bus.on('saved', () => {
      throw new Error('boom');
    });
    bus.on('saved', (p) => seen.push(p.id));
    bus.emit('saved', { id: 7 });
    expect(seen).toEqual([7]);
    expect(errors).toEqual(['saved:boom']);
  });

  it('reports errors through reportError by default', () => {
    const report = vi.fn();
    vi.stubGlobal('reportError', report);
    const bus = createEventBus<Events>();
    bus.on('closed', () => {
      throw new Error('x');
    });
    bus.emit('closed', undefined);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('is safe when a listener unsubscribes during emit', () => {
    const bus = createEventBus<Events>();
    const seen: string[] = [];
    const offB = bus.on('closed', () => seen.push('b'));
    bus.on('closed', () => {
      seen.push('a');
      offB();
    });
    bus.emit('closed', undefined);
    bus.emit('closed', undefined);
    expect(seen).toEqual(['b', 'a', 'a']);
  });
});

describe('createCrossTabBus', () => {
  it('delivers between channels with the same name and locally', async () => {
    const name = `t${String(Date.now())}`;
    const a = createCrossTabBus<Events>(name);
    const b = createCrossTabBus<Events>(name);
    expect(a.crossTab).toBe(true);
    const localSeen: number[] = [];
    const remoteSeen: number[] = [];
    a.on('saved', (p) => localSeen.push(p.id));
    b.on('saved', (p) => remoteSeen.push(p.id));
    a.emit('saved', { id: 3 });
    expect(localSeen).toEqual([3]);
    await until(() => remoteSeen.length === 1);
    expect(remoteSeen).toEqual([3]);
    expect(() => {
      a.emit('saved', { id: 1, fn: () => 1 } as unknown as { id: number });
    }).toThrow(expect.objectContaining({ code: 'SVC_BUS_UNCLONEABLE' }) as Error);
    a.close();
    b.close();
    a.emit('saved', { id: 9 });
  });

  it('drops invalid messages and honours validate and local: false', async () => {
    const name = `v${String(Date.now())}`;
    const a = createCrossTabBus<Events>(name, { local: false });
    const b = createCrossTabBus<Events>(name, { validate: (type, p) => type === 'saved' && typeof (p as { id?: unknown }).id === 'number' });
    const seenA: number[] = [];
    const seenB: number[] = [];
    a.on('saved', (p) => seenA.push(p.id));
    b.on('saved', (p) => seenB.push(p.id));
    const raw = new BroadcastChannel(`aui-bus:${name}`);
    raw.postMessage({ nope: true });
    raw.postMessage({ __aui: 1, type: 'saved', payload: { id: 'x' } });
    a.emit('saved', { id: 5 });
    await until(() => seenB.length === 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(seenB).toEqual([5]);
    // `a` has no validator (so the raw message reaches it) and local: false (its own emit does not).
    expect(seenA).toEqual(['x']);
    raw.close();
    a.close();
    b.close();
  });

  it('falls back to in-tab delivery without BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const bus = createCrossTabBus<Events>('x', { local: false });
    expect(bus.crossTab).toBe(false);
    const seen: number[] = [];
    bus.on('saved', (p) => seen.push(p.id));
    bus.emit('saved', { id: 1 });
    expect(seen).toEqual([1]);
    expect(() => createCrossTabBus('')).toThrow();
  });
});

describe('createLeaderElection', () => {
  it('uses Web Locks: one leader, hand-over on resign', async () => {
    const name = `l${String(Date.now())}`;
    const a = createLeaderElection(name);
    await a.whenLeader();
    const b = createLeaderElection(name);
    const changes: boolean[] = [];
    b.onChange((v) => changes.push(v));
    await new Promise((r) => setTimeout(r, 30));
    expect(a.isLeader).toBe(true);
    expect(b.isLeader).toBe(false);
    a.resign();
    await b.whenLeader();
    expect(changes).toEqual([true]);
    expect(a.isLeader).toBe(false);
    b.resign();
    await expect(b.whenLeader()).rejects.toMatchObject({ code: 'SVC_BUS_RESIGNED' });
  });

  it('broadcast heartbeat strategy elects exactly one leader and fails over', async () => {
    const name = `h${String(Date.now())}`;
    const a = createLeaderElection(name, { strategy: 'broadcast', heartbeatMs: 40 });
    const b = createLeaderElection(name, { strategy: 'broadcast', heartbeatMs: 40 });
    const c = createLeaderElection(name, { strategy: 'broadcast', heartbeatMs: 40 });
    await until(() => [a, b, c].some((e) => e.isLeader));
    await new Promise((r) => setTimeout(r, 300));
    expect([a, b, c].filter((e) => e.isLeader).length).toBe(1);
    const leader = [a, b, c].find((e) => e.isLeader)!;
    leader.resign();
    const rest = [a, b, c].filter((e) => e !== leader);
    await until(() => rest.some((e) => e.isLeader));
    await new Promise((r) => setTimeout(r, 300));
    expect(rest.filter((e) => e.isLeader).length).toBe(1);
    for (const e of rest) e.resign();
  });

  it('is always leader without locks or channels', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const e = createLeaderElection('solo', { strategy: 'broadcast' });
    await e.whenLeader();
    expect(e.isLeader).toBe(true);
    e.resign();
    expect(() => createLeaderElection('x', { heartbeatMs: 1 })).toThrow();
  });
});
