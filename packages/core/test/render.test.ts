import { describe, expect, it, vi } from 'vitest';
import { onNodeRelease, releaseNode, releaseNodes } from '@absoluteui/core';

describe('render-slot release contract (D8)', () => {
  it('runs the registered release once; ignores strings, null, and unregistered nodes', () => {
    const release = vi.fn();
    const node = onNodeRelease(document.createElement('span'), release);
    releaseNode(node);
    releaseNode(node);
    expect(release).toHaveBeenCalledTimes(1);
    expect(() => {
      releaseNode('text');
      releaseNode(null);
      releaseNode(undefined);
      releaseNode(document.createElement('b'));
    }).not.toThrow();
  });

  it('a failing release is reported and does not stop the others', () => {
    const report = vi.fn();
    vi.stubGlobal('reportError', report);
    const ok = vi.fn();
    const a = onNodeRelease(document.createElement('i'), () => {
      throw new Error('boom');
    });
    const b = onNodeRelease(document.createElement('i'), ok);
    releaseNodes([a, b]);
    expect(report).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
