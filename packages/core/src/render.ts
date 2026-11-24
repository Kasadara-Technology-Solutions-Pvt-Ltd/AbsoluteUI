/**
 * Render-slot release contract (docs/PLAN-R9-ANGULAR.md D8). Render hooks and content
 * options hand consumer-owned nodes to a component. A framework integration that
 * renders such a node from its own view (an Angular embedded view, a React root, ...)
 * registers how to dispose of it with `onNodeRelease`; the component calls
 * `releaseNode` when it no longer uses the node (it re-rendered, dropped the item, or
 * was destroyed). Plain DOM consumers need neither: unregistered nodes are ignored.
 * No framework concepts here: the callback is an opaque function.
 */

const releases = new WeakMap<Node, () => void>();

/** Framework integrations: run `release` once when the component no longer uses `node`. Returns `node`. */
export function onNodeRelease<T extends Node>(node: T, release: () => void): T {
  releases.set(node, release);
  return node;
}

/**
 * Components: a node returned by a render hook (or passed as content) is no longer used.
 * Idempotent; strings, null, and unregistered nodes are ignored. A failing release
 * callback is reported and never breaks the component.
 */
export function releaseNode(node: Node | string | null | undefined): void {
  if (node === null || node === undefined || typeof node === 'string') return;
  const release = releases.get(node);
  if (!release) return;
  releases.delete(node);
  try {
    release();
  } catch (error) {
    const report = (globalThis as { reportError?: (e: unknown) => void }).reportError;
    if (report) report(error);
    else
      queueMicrotask(() => {
        throw error;
      });
  }
}

/** Release every node in `nodes` (see `releaseNode`). */
export function releaseNodes(nodes: Iterable<Node | string | null | undefined>): void {
  for (const node of nodes) releaseNode(node);
}
