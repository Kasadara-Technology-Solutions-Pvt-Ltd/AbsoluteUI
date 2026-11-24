import { expect, it } from 'vitest';
import { validateFiles } from '@absoluteui/services/file';
import { describeCopyStatus } from '@absoluteui/services/clipboard';

it('matches the results quoted in the files and downloads guide', async () => {
  const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
  const result = await validateFiles([big], { accept: 'image/*,.pdf', maxFileSize: 10_000_000, detectType: false });
  expect(result.rejected[0]?.errors.map((e) => e.message)).toEqual(['The file is larger than 10 megabytes.']);
  expect(describeCopyStatus({ ok: true, method: 'clipboard-api' })).toBe('Copied to clipboard');
});

it('matches the results quoted in the HTTP client guide', async () => {
  const { describeStatus, userMessageForStatus } = await import('@absoluteui/helpers/http');
  const { createHttpClient } = await import('@absoluteui/services/http');
  const { createMockFetch } = await import('@absoluteui/services/http-mock');
  expect(userMessageForStatus(409)).toBe('This item was changed by someone else. Reload it and try again.');
  expect(describeStatus(429).reason).toBe('Too Many Requests');
  // "within two seconds ... once"; "messages over 500 characters are ignored"; unmatched mock requests are named.
  const reported: string[] = [];
  const long = 'x'.repeat(501);
  const api = createHttpClient({ fetch: createMockFetch([{ url: /./, status: 400, body: { message: long } }]), retry: false, trustServerMessages: true, reportError: (e) => { reported.push(e.message); } });
  const errors = await Promise.all([1, 2].map((n) => api.get(`http://localhost/${String(n)}`).catch((e: unknown) => e)));
  expect(reported).toHaveLength(1);
  expect((errors[0] as Error).message).toBe('Some of the information is not valid. Check it and try again.');
  await expect(createMockFetch()('http://localhost/api/x', { method: 'DELETE' })).rejects.toThrow('No mock route for DELETE /api/x.');
});
