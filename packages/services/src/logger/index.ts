/**
 * Structured logging with levels, sinks, automatic redaction and sampling (docs/PLAN-HELPERS.md section 3, section 5).
 * Messages are constant strings; data travels separately and is never interpolated into the message.
 * SSR-safe: sinks touch `console`/`navigator` only when called.
 */
import { serializeError, type SerializedError } from '@absoluteui/helpers/error';
import { isPlainObject } from '@absoluteui/helpers/is';
import { randomFloat } from '@absoluteui/helpers/random';
import { safeJsonStringify } from '@absoluteui/helpers/json';
import { DEFAULT_REDACT_KEYS, redact } from '@absoluteui/helpers/sanitize';

/** Severity of a record. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
/** Minimum level to emit; `'silent'` emits nothing. */
export type LogThreshold = LogLevel | 'silent';

const RANK: Readonly<Record<LogThreshold, number>> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, silent: 100 };

/** One structured log record. */
export interface LogRecord {
  /** ISO 8601 timestamp. */
  readonly time: string;
  readonly level: LogLevel;
  /** Logger name (dotted for children, for example `app.grid`). */
  readonly name: string;
  /** Constant message; never contains data. */
  readonly message: string;
  /** Redacted data. */
  readonly data?: unknown;
  /** Redacted context of the logger and its parents. */
  readonly context: Readonly<Record<string, unknown>>;
  /** Serialized error, without stack unless `includeStack` is set. */
  readonly error?: SerializedError;
}

/** Destination for records. `write` must not throw (failures are swallowed). */
export interface LogSink {
  write(record: LogRecord): void;
  /** Sends buffered records now. */
  flush?(): Promise<void> | void;
  /** Flushes and releases resources. */
  close?(): Promise<void> | void;
}

/** Options for {@link createLogger}. */
export interface LoggerOptions {
  /** Minimum level. Default `'info'`. */
  readonly level?: LogThreshold;
  /** Default `'app'`. */
  readonly name?: string;
  /** Default `[consoleSink()]`. */
  readonly sinks?: readonly LogSink[];
  /** Key names/patterns to redact (default helpers/sanitize `DEFAULT_REDACT_KEYS`), or `false` to disable (not recommended). */
  readonly redact?: readonly (string | RegExp)[] | false;
  /** Strip query strings and fragments from string values under keys ending in `url`/`uri`/`href`. Default true. */
  readonly stripUrlQuery?: boolean;
  /** Fraction (0..1) of records kept: one number for all levels, or per level (missing levels keep 1). Default 1. */
  readonly sampleRate?: number | Readonly<Partial<Record<LogLevel, number>>>;
  /** Fields added to every record. */
  readonly context?: Readonly<Record<string, unknown>>;
  /** Include error stacks. Default false (stacks leak paths and code structure in production). */
  readonly includeStack?: boolean;
  /** Clock, injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

/** Logger returned by {@link createLogger}. */
export interface Logger {
  readonly name: string;
  /** Current threshold (shared with children). */
  readonly level: LogThreshold;
  setLevel(level: LogThreshold): void;
  isEnabled(level: LogLevel): boolean;
  trace(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  /** `data` may be an `Error` or an object with an `error` field; it is serialized into `record.error`. */
  error(message: string, data?: unknown): void;
  /** Logger with extra context (and optionally a sub-name); shares sinks and level. */
  child(context: Readonly<Record<string, unknown>>, options?: { readonly name?: string }): Logger;
  /** Starts a timer; `end()` logs `label` with `durationMs` at `level` (default `'debug'`) and returns the duration. */
  withTimer(label: string, options?: { readonly level?: LogLevel; readonly data?: Readonly<Record<string, unknown>> }): (data?: Readonly<Record<string, unknown>>) => number;
  /** Flushes every sink. */
  flush(): Promise<void>;
}

const URL_KEY = /(?:url|uri|href)$/i;
const MAX_WALK_DEPTH = 20;

/** Removes `?query` and `#fragment` (tokens and PII often live there). */
function stripQuery(s: string): string {
  const q = s.indexOf('?');
  const h = s.indexOf('#');
  const cut = q < 0 ? h : h < 0 ? q : Math.min(q, h);
  return cut < 0 ? s : s.slice(0, cut);
}

/** Copy with URL query strings stripped; plain objects and arrays only, cycle and depth safe. */
function stripUrls(value: unknown, depth = 0, seen = new Set<object>()): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[Circular]';
  if (depth > MAX_WALK_DEPTH) return '[Truncated]';
  if (Array.isArray(value)) {
    seen.add(value);
    const out = value.map((v) => stripUrls(v, depth + 1, seen));
    seen.delete(value);
    return out;
  }
  if (!isPlainObject(value)) return value;
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const v = value[k];
    out[k] = typeof v === 'string' && URL_KEY.test(k) ? stripQuery(v) : v instanceof URL && URL_KEY.test(k) ? stripQuery(v.href) : stripUrls(v, depth + 1, seen);
  }
  seen.delete(value);
  return out;
}

function assertLevel(level: string): asserts level is LogThreshold {
  if (!Object.prototype.hasOwnProperty.call(RANK, level)) throw new TypeError('Unknown log level.');
}

function clampRate(r: number): number {
  return Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 1;
}

/**
 * Creates a structured logger.
 * @example
 * const mem = memorySink();
 * const log = createLogger({ name: 'hr', level: 'debug', context: { app: 'PeopleHub' }, sinks: [mem] });
 * log.info('Employee saved', { id: 42, token: 'x' });
 * mem.records()[0]?.data; // => { id: 42, token: '[REDACTED]' }
 * const end = log.withTimer('Load grid');
 * end({ rows: 1200 }); // logs 'Load grid' with durationMs at debug level
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const { level = 'info', name = 'app', sinks = [consoleSink()], stripUrlQuery = true, sampleRate = 1, context = {}, includeStack = false, now = Date.now } = options;
  assertLevel(level);
  const keys = options.redact ?? DEFAULT_REDACT_KEYS;
  const state = { level };
  const rate = (l: LogLevel): number => (typeof sampleRate === 'number' ? clampRate(sampleRate) : clampRate(sampleRate[l] ?? 1));
  const clean = (v: unknown): unknown => {
    const stripped = stripUrlQuery ? stripUrls(v) : v;
    return keys === false ? stripped : redact(stripped, { keys });
  };

  const make = (loggerName: string, ctx: Readonly<Record<string, unknown>>): Logger => {
    const cleanCtx = clean(ctx) as Readonly<Record<string, unknown>>;
    const emit = (lvl: LogLevel, message: string, data: unknown): void => {
      if (RANK[lvl] < RANK[state.level]) return;
      const r = rate(lvl);
      if (r < 1 && (r === 0 || randomFloat() >= r)) return;
      let payload = data;
      let err: unknown;
      if (payload instanceof Error) {
        err = payload;
        payload = undefined;
      } else if (isPlainObject(payload) && payload.error instanceof Error) {
        err = payload.error;
        const rest: Record<string, unknown> = { ...payload };
        delete rest.error;
        payload = Object.keys(rest).length > 0 ? rest : undefined;
      }
      const record: { -readonly [K in keyof LogRecord]: LogRecord[K] } = { time: new Date(now()).toISOString(), level: lvl, name: loggerName, message, context: cleanCtx };
      if (payload !== undefined) record.data = clean(payload);
      if (err !== undefined) record.error = clean(serializeError(err, { includeStack })) as SerializedError;
      const frozen = Object.freeze(record);
      for (const s of sinks) {
        try {
          s.write(frozen);
        } catch {
          // A failing sink must never break the application.
        }
      }
    };
    const logger: Logger = {
      name: loggerName,
      get level() {
        return state.level;
      },
      setLevel(l) {
        assertLevel(l);
        state.level = l;
      },
      isEnabled: (l) => RANK[l] >= RANK[state.level],
      trace: (m, d) => {
        emit('trace', m, d);
      },
      debug: (m, d) => {
        emit('debug', m, d);
      },
      info: (m, d) => {
        emit('info', m, d);
      },
      warn: (m, d) => {
        emit('warn', m, d);
      },
      error: (m, d) => {
        emit('error', m, d);
      },
      child: (extra, opts = {}) => make(opts.name === undefined ? loggerName : `${loggerName}.${opts.name}`, { ...ctx, ...extra }),
      withTimer(label, opts = {}) {
        const clock = (): number => (typeof performance === 'object' && typeof performance.now === 'function' ? performance.now() : now());
        const start = clock();
        let done = false;
        return (data) => {
          const durationMs = Math.round((clock() - start) * 1000) / 1000;
          if (!done) {
            done = true;
            emit(opts.level ?? 'debug', label, { ...opts.data, ...data, durationMs });
          }
          return durationMs;
        };
      },
      async flush() {
        await Promise.all(sinks.map(async (s) => s.flush?.()));
      },
    };
    return logger;
  };
  return make(name, context);
}

// ---------------------------------------------------------------------------
// Sinks

/** Options for {@link consoleSink}. */
export interface ConsoleSinkOptions {
  /** `'pretty'` (default) logs `[name] message` plus data; `'json'` logs one JSON line per record. */
  readonly format?: 'pretty' | 'json';
}

/**
 * Writes records to `console` (the only place this package uses it).
 * @example createLogger({ sinks: [consoleSink({ format: 'json' })] });
 */
export function consoleSink(options: ConsoleSinkOptions = {}): LogSink {
  const { format = 'pretty' } = options;
  return {
    write(record) {
      const method = record.level === 'trace' ? 'debug' : record.level;
      const args: unknown[] = format === 'json' ? [safeJsonStringify(record) ?? ''] : [`[${record.name}] ${record.message}`, ...[record.data, record.error].filter((x) => x !== undefined), ...(Object.keys(record.context).length > 0 ? [record.context] : [])];
      // eslint-disable-next-line no-console -- consoleSink is the logger's single, explicit console destination.
      console[method](...args);
    },
  };
}

/** Ring-buffer sink returned by {@link memorySink}. */
export interface MemorySink extends LogSink {
  /** Buffered records, oldest first. */
  records(): LogRecord[];
  clear(): void;
}

/**
 * Keeps the last `capacity` records in memory (tests, diagnostics, "copy logs" support buttons).
 * @example
 * const mem = memorySink({ capacity: 200 });
 * createLogger({ name: 'app', sinks: [mem] }).warn('Slow response');
 * mem.records().map((r) => r.message); // => ['Slow response']
 */
export function memorySink(options: { readonly capacity?: number } = {}): MemorySink {
  const capacity = options.capacity ?? 1000;
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer.');
  const buf: (LogRecord | undefined)[] = new Array<LogRecord | undefined>(capacity);
  let start = 0;
  let size = 0;
  return {
    write(record) {
      buf[(start + size) % capacity] = record;
      if (size < capacity) size++;
      else start = (start + 1) % capacity;
    },
    records() {
      const out: LogRecord[] = [];
      for (let i = 0; i < size; i++) {
        const r = buf[(start + i) % capacity];
        if (r) out.push(r);
      }
      return out;
    },
    clear() {
      buf.fill(undefined);
      start = 0;
      size = 0;
    },
  };
}

/** Options for {@link batchingSink}. */
export interface BatchingSinkOptions {
  /** Records per `send`. Default 50. */
  readonly maxBatch?: number;
  /** Flush interval. Default 5000 ms. */
  readonly flushIntervalMs?: number;
  /** Queue cap; the oldest records are dropped beyond it. Default 1000. */
  readonly maxQueue?: number;
  /** Endpoint for `navigator.sendBeacon` on `pagehide`/hidden (JSON array body). Without it, `send` is called without awaiting. */
  readonly beaconUrl?: string;
  /** Called when `send` fails; the batch is dropped (no unbounded retry). */
  readonly onError?: (error: unknown, dropped: number) => void;
}

/** Sink returned by {@link batchingSink}. */
export interface BatchingSink extends LogSink {
  flush(): Promise<void>;
  close(): Promise<void>;
  /** Records dropped because the queue was full. */
  readonly dropped: number;
}

/**
 * Buffers records and ships them in batches (for example to a telemetry endpoint). On `pagehide` or when the
 * page becomes hidden it sends the queue with `navigator.sendBeacon` (never blocking unload).
 * @example
 * const remote = batchingSink((records) => fetch('/api/logs', { method: 'POST', body: JSON.stringify(records), keepalive: true }).then(() => undefined),
 *   { beaconUrl: '/api/logs' });
 */
export function batchingSink(send: (records: readonly LogRecord[]) => Promise<void> | void, options: BatchingSinkOptions = {}): BatchingSink {
  const { maxBatch = 50, flushIntervalMs = 5000, maxQueue = 1000, beaconUrl, onError } = options;
  const queue: LogRecord[] = [];
  let dropped = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> = Promise.resolve();
  let closed = false;

  const schedule = (): void => {
    if (timer !== undefined || closed) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, flushIntervalMs);
  };
  const flush = (): Promise<void> => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    inflight = inflight.then(async () => {
      while (queue.length > 0) {
        const batch = queue.splice(0, maxBatch);
        try {
          await send(batch);
        } catch (e) {
          try {
            onError?.(e, batch.length);
          } catch {
            // Ignore reporter failures.
          }
        }
      }
    });
    return inflight;
  };
  const unloadFlush = (): void => {
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    const nav = (globalThis as { navigator?: { sendBeacon?: (url: string, body: Blob) => boolean } }).navigator;
    if (beaconUrl !== undefined && typeof nav?.sendBeacon === 'function') {
      for (let i = 0; i < batch.length; i += maxBatch) {
        const body = safeJsonStringify(batch.slice(i, i + maxBatch)) ?? '[]';
        try {
          nav.sendBeacon(beaconUrl, new Blob([body], { type: 'application/json' }));
        } catch {
          // Beacon refused (size limit): nothing more can be done during unload.
        }
      }
      return;
    }
    try {
      void Promise.resolve(send(batch)).catch(() => undefined);
    } catch {
      // Never throw during unload.
    }
  };
  const target = globalThis as { addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void; document?: { visibilityState?: string } };
  const onPageHide = (): void => {
    unloadFlush();
  };
  const onVisibility = (): void => {
    if (target.document?.visibilityState === 'hidden') unloadFlush();
  };
  if (typeof target.addEventListener === 'function') {
    target.addEventListener('pagehide', onPageHide);
    target.addEventListener('visibilitychange', onVisibility);
  }
  return {
    get dropped() {
      return dropped;
    },
    write(record) {
      if (closed) return;
      queue.push(record);
      if (queue.length > maxQueue) {
        const over = queue.length - maxQueue;
        queue.splice(0, over);
        dropped += over;
      }
      if (queue.length >= maxBatch) void flush();
      else schedule();
    },
    flush,
    async close() {
      if (closed) return;
      closed = true;
      target.removeEventListener?.('pagehide', onPageHide);
      target.removeEventListener?.('visibilitychange', onVisibility);
      await flush();
    },
  };
}

/**
 * Forwards only records that pass `predicate` (for example errors to a remote sink).
 * @example
 * const mem = memorySink();
 * const log = createLogger({ sinks: [filterSink(mem, (r) => r.level === 'error' || r.level === 'warn')] });
 * log.info('Loaded');
 * log.warn('Retrying');
 * mem.records().map((r) => r.message); // => ['Retrying']
 */
export function filterSink(sink: LogSink, predicate: (record: LogRecord) => boolean): LogSink {
  const out: LogSink = {
    write(record) {
      if (predicate(record)) sink.write(record);
    },
  };
  if (sink.flush) out.flush = () => sink.flush?.();
  if (sink.close) out.close = () => sink.close?.();
  return out;
}
