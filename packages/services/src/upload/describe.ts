/** Screen-reader friendly upload status text (docs/PLAN-HELPERS.md section 6). */
import { humanizeDuration } from '@absoluteui/helpers/duration';
import { formatPercent } from '@absoluteui/helpers/number';
import type { UploadProgress, UploadState } from './types.js';

/** Sentence builders; override to translate. Inputs are already locale-formatted. */
export interface UploadProgressMessages {
  readonly queued: () => string;
  readonly uploading: (percent: string, remaining: string | undefined) => string;
  readonly paused: (percent: string) => string;
  readonly completed: () => string;
  readonly failed: () => string;
  readonly cancelled: () => string;
}

export interface DescribeUploadProgressOptions {
  readonly locale?: string;
  /** Upload state; default `'uploading'`. */
  readonly state?: UploadState;
  readonly messages?: Partial<UploadProgressMessages>;
}

const EN: UploadProgressMessages = {
  queued: () => 'Waiting to upload',
  uploading: (p, r) => (r === undefined ? `${p} uploaded` : `${p} uploaded, about ${r} remaining`),
  paused: (p) => `Upload paused at ${p}`,
  completed: () => 'Upload complete',
  failed: () => 'Upload failed',
  cancelled: () => 'Upload cancelled',
};

/**
 * Status sentence for a live region, with the percentage and remaining time formatted by `Intl`
 * (the UI should throttle announcements). English sentences by default; pass `messages` to translate.
 * @example
 * describeUploadProgress({ loaded: 45, total: 100, percent: 45, speedBps: 1, etaMs: 120_000 }, { locale: 'en' });
 * // => '45% uploaded, about 2 minutes remaining'
 */
export function describeUploadProgress(progress: UploadProgress, options: DescribeUploadProgressOptions = {}): string {
  const m: UploadProgressMessages = { ...EN, ...options.messages };
  const locale = options.locale;
  const state = options.state ?? 'uploading';
  const pct = formatPercent(Math.floor(Math.max(0, Math.min(100, progress.percent))) / 100, { maximumFractionDigits: 0, ...(locale === undefined ? {} : { locale }) });
  switch (state) {
    case 'queued':
      return m.queued();
    case 'paused':
      return m.paused(pct);
    case 'completed':
      return m.completed();
    case 'failed':
      return m.failed();
    case 'cancelled':
      return m.cancelled();
    case 'uploading': {
      const eta = progress.etaMs;
      const remaining = eta !== null && Number.isFinite(eta) && eta >= 1000 ? humanizeDuration(eta, { largestUnits: 1, smallestUnit: 'seconds', ...(locale === undefined ? {} : { locale }) }) : undefined;
      return m.uploading(pct, remaining);
    }
  }
}
