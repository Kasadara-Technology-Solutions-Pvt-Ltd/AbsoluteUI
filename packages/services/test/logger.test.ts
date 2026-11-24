import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelperError } from '@absoluteui/helpers/error';
import { batchingSink, consoleSink, createLogger, filterSink, memorySink, type LogRecord } from '@absoluteui/services/logger';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const setup = (opts: Parameters<typeof createLogger>[0] = {}) => {
  const mem = memorySink();
  const log = createLogger({ name: 'test', level: 'trace', now: () => Date.UTC(2026, 0, 1), sinks: [mem], ...opts });
  return { mem, log };
};

describe('createLogger', () => {
  it('writes structured records and filters by level', () => {
    const { mem, log } = setup({ level: 'info', context: { app: 'x' } });
    log.debug('hidden');
    log.info('Saved', { id: 1 });
    log.warn('Careful');
    const [a, b] = mem.records();
    expect(a).toEqual({ time: '2026-01-01T00:00:00.000Z', level: 'info', name: 'test', message: 'Saved', data: { id: 1 }, context: { app: 'x' } });
    expect(b?.level).toBe('warn');
    expect(mem.records().length).toBe(2);
    expect(log.isEnabled('debug')).toBe(false);
    log.setLevel('silent');
    log.error('nothing');
    expect(mem.records().length).toBe(2);
    expect(() => {
      log.setLevel('loud' as 'info');
    }).toThrow();
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('redacts secrets in data and context, and strips URL queries', () => {
    const { mem, log } = setup({ context: { sessionId: 's1', user: 'ada' } });
    log.info('Request', { url: 'https://api.test/x?token=abc#frag', nextUrl: new URL('https://a.test/p?q=1'), password: 'hunter2', nested: { authorization: 'Bearer t', ok: true }, list: [{ apiKey: 'k' }] });
    const r = mem.records()[0]!;
    expect(r.data).toEqual({ url: 'https://api.test/x', nextUrl: 'https://a.test/p', password: '[REDACTED]', nested: { authorization: '[REDACTED]', ok: true }, list: [{ apiKey: '[REDACTED]' }] });
    expect(r.context).toEqual({ sessionId: '[REDACTED]', user: 'ada' });
    expect(r.message).toBe('Request');
  });

  it('supports custom redact keys and disabling URL stripping', () => {
    const { mem, log } = setup({ redact: ['ssn'], stripUrlQuery: false });
    log.info('x', { ssn: '123', password: 'p', url: '/a?b=1' });
    expect(mem.records()[0]?.data).toEqual({ ssn: '[REDACTED]', password: 'p', url: '/a?b=1' });
  });

  it('serializes errors without stacks by default', () => {
    const { mem, log } = setup();
    log.error('Failed', new HelperError('SVC_X', 'Boom.', { details: { token: 'secret' } }));
    log.error('Failed with data', { error: new Error('e2'), id: 5 });
    const [a, b] = mem.records();
    expect(a?.error).toMatchObject({ name: 'HelperError', code: 'SVC_X', message: 'Boom.', details: { token: '[REDACTED]' } });
    expect(a?.error?.stack).toBeUndefined();
    expect(a?.data).toBeUndefined();
    expect(b?.error?.message).toBe('e2');
    expect(b?.data).toEqual({ id: 5 });
    const withStack = setup({ includeStack: true });
    withStack.log.error('x', new Error('s'));
    expect(withStack.mem.records()[0]?.error?.stack).toBeTypeOf('string');
  });

  it('handles cyclic data', () => {
    const { mem, log } = setup();
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    log.info('cycle', a);
    expect((mem.records()[0]?.data as Record<string, unknown>).self).toBe('[Circular]');
  });

  it('children share sinks and level and merge context', () => {
    const { mem, log } = setup({ context: { a: 1 } });
    const child = log.child({ b: 2 }, { name: 'grid' });
    child.info('hi');
    expect(mem.records()[0]).toMatchObject({ name: 'test.grid', context: { a: 1, b: 2 } });
    log.setLevel('error');
    child.info('dropped');
    expect(mem.records().length).toBe(1);
    expect(child.level).toBe('error');
  });

  it('samples per level', () => {
    const { mem, log } = setup({ sampleRate: { debug: 0 } });
    for (let i = 0; i < 10; i++) log.debug('d');
    log.info('i');
    expect(mem.records().map((r) => r.level)).toEqual(['info']);
    const half = setup({ sampleRate: 0.5 });
    for (let i = 0; i < 400; i++) half.log.info('x');
    const n = half.mem.records().length;
    expect(n).toBeGreaterThan(120);
    expect(n).toBeLessThan(280);
  });

  it('times operations once', () => {
    const { mem, log } = setup();
    const end = log.withTimer('Load', { level: 'info', data: { grid: 'emp' } });
    const d = end({ rows: 3 });
    end();
    expect(d).toBeGreaterThanOrEqual(0);
    expect(mem.records().length).toBe(1);
    expect(mem.records()[0]).toMatchObject({ level: 'info', message: 'Load', data: { grid: 'emp', rows: 3 } });
  });

  it('isolates failing sinks', () => {
    const mem = memorySink();
    const log = createLogger({ sinks: [{ write: () => { throw new Error('sink'); } }, mem] });
    expect(() => {
      log.info('ok');
    }).not.toThrow();
    expect(mem.records().length).toBe(1);
  });
});

describe('sinks', () => {
  it('memorySink is a bounded ring buffer', () => {
    const mem = memorySink({ capacity: 3 });
    const log = createLogger({ sinks: [mem] });
    for (let i = 0; i < 5; i++) log.info(`m${String(i)}`);
    expect(mem.records().map((r) => r.message)).toEqual(['m2', 'm3', 'm4']);
    mem.clear();
    expect(mem.records()).toEqual([]);
    expect(() => memorySink({ capacity: 0 })).toThrow();
  });

  it('consoleSink maps levels to console methods', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = createLogger({ level: 'trace', name: 'c', sinks: [consoleSink()] });
    log.trace('t');
    log.error('e', { a: 1 });
    expect(debug).toHaveBeenCalledWith('[c] t');
    expect(error).toHaveBeenCalledWith('[c] e', { a: 1 });
    createLogger({ sinks: [consoleSink({ format: 'json' })] }).info('j');
    expect(JSON.parse(info.mock.calls[0]?.[0] as string)).toMatchObject({ message: 'j' });
  });

  it('filterSink forwards matching records', () => {
    const mem = memorySink();
    const log = createLogger({ level: 'trace', sinks: [filterSink(mem, (r) => r.level === 'error')] });
    log.info('no');
    log.error('yes');
    expect(mem.records().map((r) => r.message)).toEqual(['yes']);
  });

  it('batchingSink batches by size and interval, caps the queue and reports failures', async () => {
    vi.useFakeTimers();
    const batches: LogRecord[][] = [];
    const sink = batchingSink((r) => { batches.push([...r]); }, { maxBatch: 3, flushIntervalMs: 1000, maxQueue: 5 });
    const log = createLogger({ sinks: [sink] });
    log.info('1');
    log.info('2');
    expect(batches.length).toBe(0);
    log.info('3');
    await vi.advanceTimersByTimeAsync(0);
    expect(batches.map((b) => b.length)).toEqual([3]);
    log.info('4');
    await vi.advanceTimersByTimeAsync(1000);
    expect(batches.map((b) => b.length)).toEqual([3, 1]);
    await sink.close();

    const errors: number[] = [];
    const failing = batchingSink(() => Promise.reject(new Error('down')), { maxBatch: 100, maxQueue: 2, onError: (_, n) => errors.push(n) });
    const l2 = createLogger({ sinks: [failing] });
    l2.info('a');
    l2.info('b');
    l2.info('c');
    expect(failing.dropped).toBe(1);
    await failing.flush();
    expect(errors).toEqual([2]);
    await failing.close();
  });

  it('batchingSink sends a beacon on pagehide', async () => {
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => true);
    try {
      const sent: unknown[] = [];
      const sink = batchingSink((r) => { sent.push(r); }, { beaconUrl: '/logs', flushIntervalMs: 60_000 });
      createLogger({ sinks: [sink] }).warn('bye');
      window.dispatchEvent(new Event('pagehide'));
      expect(beacon).toHaveBeenCalledTimes(1);
      const [url, body] = beacon.mock.calls[0] as [string, Blob];
      expect(url).toBe('/logs');
      expect(JSON.parse(await body.text())).toMatchObject([{ message: 'bye' }]);
      expect(sent.length).toBe(0);
      await sink.close();
    } finally {
      beacon.mockRestore();
    }
  });
});
