// Records e2e outcomes and measured performance values to test-results/evidence.json,
// the input of the documentation site's performance and accessibility pages (R4-6, R4-7).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface Measurement {
  label: string;
  value: number;
  budget: number;
}

interface Entry {
  file: string;
  suite: string;
  title: string;
  project: string;
  status: TestResult['status'];
  durationMs: number;
  measurements: Measurement[];
}

function isMeasurement(value: unknown): value is Measurement {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.label === 'string' && typeof v.value === 'number' && typeof v.budget === 'number';
}

export default class EvidenceReporter implements Reporter {
  private readonly entries: Entry[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const measurements: Measurement[] = [];
    for (const a of result.annotations) {
      if (a.type !== 'perf' || !a.description) continue;
      try {
        const parsed: unknown = JSON.parse(a.description);
        if (isMeasurement(parsed)) measurements.push(parsed);
      } catch {
        // Malformed annotations are ignored; the assertion itself still ran.
      }
    }
    // Retries report the same test again; the last result wins.
    const file = relative(process.cwd(), test.location.file).split(sep).join('/');
    // titlePath: root, project, file, ...describe blocks, test.
    const suite = test.titlePath().slice(3, -1).join(' › ');
    const title = test.title;
    const project = test.parent.project()?.name ?? '';
    const existing = this.entries.findIndex((e) => e.file === file && e.suite === suite && e.title === title && e.project === project);
    const entry: Entry = { file, suite, title, project, status: result.status, durationMs: result.duration, measurements };
    if (existing >= 0) this.entries[existing] = entry;
    else this.entries.push(entry);
  }

  onEnd(): void {
    let commit: string;
    try {
      commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      commit = 'unknown';
    }
    const pkg: unknown = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', '@playwright', 'test', 'package.json'), 'utf8'));
    const playwright = typeof pkg === 'object' && pkg !== null && 'version' in pkg ? String(pkg.version) : 'unknown';
    const out = join(process.cwd(), 'test-results');
    mkdirSync(out, { recursive: true });
    const evidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      commit,
      environment: {
        os: `${platform()} ${release()} (${arch()})`,
        cpu: cpus()[0]?.model.trim() ?? 'unknown',
        cores: cpus().length,
        memoryGb: Math.round(totalmem() / 1024 ** 3),
        node: process.version,
        playwright,
        browser: 'Chromium, Firefox, and WebKit bundled with Playwright (headless desktop profiles); performance in Chromium',
      },
      tests: this.entries,
    };
    writeFileSync(join(out, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
