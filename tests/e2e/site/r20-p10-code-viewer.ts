// R20 P10 page: Code Viewer (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { CodeViewer, type CodeViewerChangeDetail, type CodeViewerCopyDetail } from '@absoluteui/components/code-viewer';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const source = [
  "import { submit } from './api.js';",
  '',
  '/** Request leave for a number of business days. */',
  'export async function requestLeave(days: number, note = `none`): Promise<void> {',
  "  if (days <= 0) throw new Error('days must be positive');",
  '  await submit({ days, note });',
  '}',
].join('\n');

const tsHost = byId('code-ts');
const code = CodeViewer.create(tsHost, { label: 'Leave request handler', filename: 'leave.ts', language: 'typescript', code: source, highlightLines: [4] });
tsHost.addEventListener('aui-copy', (e) => {
  byId('code-log').textContent = `Copied ${String((e as CustomEvent<CodeViewerCopyDetail>).detail.text.length)} characters`;
});
tsHost.addEventListener('aui-change', (e) => {
  byId('code-log').textContent = `Wrap: ${String((e as CustomEvent<CodeViewerChangeDetail>).detail.wrap)}`;
});

const original = JSON.stringify({ annualLeave: 20, carryOver: 5, approvers: ['manager'] }, null, 2);
const modified = JSON.stringify({ annualLeave: 22, carryOver: 5, approvers: ['manager', 'hr'], sabbatical: true }, null, 2);
const diffHost = byId('code-diff');
const diff = CodeViewer.create(diffHost, { label: 'Leave policy changes', filename: 'policy.json', language: 'json', diff: { original, modified } });
diffHost.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<CodeViewerChangeDetail>).detail;
  byId('diff-log').textContent = `Mode: ${d.mode ?? 'none'}`;
});

const big = Array.from({ length: 10_000 }, (_, i) => `export const value${String(i)} = compute(${String(i)}, 'row ${String(i)}'); // line ${String(i + 1)}`).join('\n');
const bigViewer = CodeViewer.create(byId('code-big'), { label: 'Generated constants', filename: 'constants.ts', language: 'typescript', code: big, maxHeight: '20rem' });

Object.assign(window, { __auiReady: true, __code: code, __diff: diff, __big: bigViewer });
