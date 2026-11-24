/**
 * Configuration subscriptions for components that are rendered into nodes the
 * application may discard without calling destroy(), such as Data Table cells
 * (Badge, Avatar, Kbd). The subscription holds the component weakly; the host
 * element keeps it alive while the host itself is alive. When the host is dropped,
 * the component becomes collectable and its listener unsubscribes on the next
 * configuration change. Internal: not a public subpath export.
 */

/** Host element -> component: keeps a component alive exactly as long as its host. */
const alive = new WeakMap<Element, object>();

/**
 * Subscribe `owner` to `subscribe` without the listener keeping it alive.
 * Returns the unsubscribe function (also releases the host link); call it from destroy().
 */
export function subscribeWhileHosted<T extends object>(host: Element, owner: T, subscribe: (listener: () => void) => () => void, onChange: (owner: T) => void): () => void {
  alive.set(host, owner);
  const ref = new WeakRef(owner);
  let unsubscribe: () => void = () => undefined;
  unsubscribe = subscribe(() => {
    const current = ref.deref();
    if (current === undefined) unsubscribe();
    else onChange(current);
  });
  return () => {
    unsubscribe();
    if (alive.get(host) === owner) alive.delete(host);
  };
}
