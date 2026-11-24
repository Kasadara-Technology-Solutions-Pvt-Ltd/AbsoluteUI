import { test, type Page } from '@playwright/test';
import type { FileUpload } from '@absoluteui/components/file-upload';
import type { UploadQueue } from '@absoluteui/components/upload-queue';
import type { PasswordInput } from '@absoluteui/components/password-input';
import type { PasswordStrengthMeter } from '@absoluteui/components/password-strength-meter';
import type { OtpInput } from '@absoluteui/components/otp-input';
import type { SessionWarningDialog } from '@absoluteui/components/session-warning-dialog';
import type { instant } from '@absoluteui/core';
import { withinBudget } from './budget.js';

// R2 upload and authentication UI performance budgets declared in metadata/*/component.json
// (SPEC section 15.2). Headless Chromium, production build, median of 5 runs.

interface Harness {
  __aui: {
    FileUpload: typeof FileUpload;
    UploadQueue: typeof UploadQueue;
    PasswordInput: typeof PasswordInput;
    PasswordStrengthMeter: typeof PasswordStrengthMeter;
    OtpInput: typeof OtpInput;
    SessionWarningDialog: typeof SessionWarningDialog;
    instant: typeof instant;
  };
  __auiReady?: boolean;
}

async function open(page: Page): Promise<void> {
  await page.goto('/upload-auth');
  await page.waitForFunction(() => (window as unknown as Harness).__auiReady === true);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

async function measure(page: Page, run: () => number): Promise<number> {
  const results: number[] = [];
  for (let i = 0; i < 5; i++) results.push(await page.evaluate(run));
  return median(results);
}

type Kind = 'FileUpload' | 'PasswordInput' | 'OtpInput';

const createBudgets: [Kind, number, number][] = [
  ['FileUpload', 500, 1],
  ['PasswordInput', 1000, 1],
  ['OtpInput', 1000, 1],
];

test.describe('upload and authentication performance budgets', () => {
  for (const [kind, count, budget] of createBudgets) {
    test(`${kind}.create: < ${budget} ms average per instance (${count} instances)`, async ({ page }) => {
      await open(page);
      const results: number[] = [];
      for (let run = 0; run < 5; run++) {
        results.push(
          await page.evaluate(
            ([k, n]) => {
              const aui = (window as unknown as Harness).__aui;
              const hosts = Array.from({ length: n }, () => {
                const h = document.createElement('div');
                document.body.append(h);
                return h;
              });
              const start = performance.now();
              const made = hosts.map((h, i): { destroy(): void } => {
                const label = `Field ${i}`;
                switch (k) {
                  case 'FileUpload':
                    return aui.FileUpload.create(h, { label, multiple: true, acceptExtensions: ['.pdf'], maxFileSize: 5_000_000, maxFiles: 3 });
                  case 'PasswordInput':
                    return aui.PasswordInput.create(h, { label, required: true, minLength: 12 });
                  case 'OtpInput':
                    return aui.OtpInput.create(h, { label, required: true });
                }
              });
              const elapsed = performance.now() - start;
              for (const m of made) m.destroy();
              for (const h of hosts) h.remove();
              return elapsed / n;
            },
            [kind, count] as const,
          ),
        );
      }
      const avg = median(results);
      test.info().annotations.push({ type: 'perf', description: `${kind}.create avg: ${avg.toFixed(3)} ms` });
      withinBudget(avg, budget, 'avg');
    });
  }

  test('FileUpload: dropping 200 files (validate and render rows): < 100 ms', async ({ page }) => {
    await open(page);
    const t = await measure(page, () => {
      const { FileUpload } = (window as unknown as Harness).__aui;
      const h = document.createElement('div');
      document.body.append(h);
      const u = FileUpload.create(h, { label: 'Perf', multiple: true, maxFileSize: 1_000_000 });
      const dt = new DataTransfer();
      for (let i = 0; i < 200; i++) dt.items.add(new File([new Uint8Array(10)], `file-${String(i)}.txt`, { type: 'text/plain' }));
      const zone = h.querySelector('.aui-file-upload__zone')!;
      const start = performance.now();
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      const elapsed = performance.now() - start;
      if (u.value.length !== 200) throw new Error('drop failed');
      u.destroy();
      h.remove();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `FileUpload drop(200): ${t.toFixed(1)} ms` });
    withinBudget(t, 100, 't');
  });

  test('UploadQueue.add with 200 files: < 100 ms', async ({ page }) => {
    await open(page);
    const t = await measure(page, () => {
      const { UploadQueue } = (window as unknown as Harness).__aui;
      const h = document.createElement('div');
      document.body.append(h);
      // A transport that never settles: measures rendering and scheduling only.
      const q = UploadQueue.create(h, { label: 'Perf', upload: () => new Promise(() => undefined) });
      const files = Array.from({ length: 200 }, (_, i) => new File([new Uint8Array(10)], `file-${String(i)}.txt`));
      const start = performance.now();
      q.add(files);
      const elapsed = performance.now() - start;
      q.destroy();
      h.remove();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `UploadQueue.add(200): ${t.toFixed(1)} ms` });
    withinBudget(t, 100, 't');
  });

  test('PasswordStrengthMeter.evaluate (default rules): < 1 ms average', async ({ page }) => {
    await open(page);
    const t = await measure(page, () => {
      const { PasswordStrengthMeter } = (window as unknown as Harness).__aui;
      const h = document.createElement('div');
      document.body.append(h);
      const m = PasswordStrengthMeter.create(h, { announce: false });
      const start = performance.now();
      for (let i = 0; i < 500; i++) m.evaluate(`abcDEF${String(i)}-correct-horse`);
      const elapsed = (performance.now() - start) / 500;
      m.destroy();
      h.remove();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `PasswordStrengthMeter.evaluate avg: ${t.toFixed(3)} ms` });
    withinBudget(t, 1, 't');
  });

  test('SessionWarningDialog.open: < 16 ms', async ({ page }) => {
    await open(page);
    const t = await measure(page, () => {
      const { SessionWarningDialog, instant } = (window as unknown as Harness).__aui;
      const d = SessionWarningDialog.create({ expiresAt: instant(Date.now() + 120_000) });
      const start = performance.now();
      d.open();
      const elapsed = performance.now() - start;
      d.destroy();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `SessionWarningDialog.open: ${t.toFixed(2)} ms` });
    withinBudget(t, 16, 't');
  });
});
