/**
 * Data structures (docs/PLAN-HELPERS.md section 2 `ds`). Each class documents its Big-O in TSDoc.
 * Algorithms are iterative (or bounded by O(log n) recursion) so large inputs cannot overflow the stack.
 */
export type { Comparer } from './internal.js';
export { naturalCompare } from './internal.js';
export { Stack } from './stack.js';
export { Deque, Queue, CircularBuffer } from './ring.js';
export { BinaryHeap, PriorityQueue } from './heap.js';
export { LinkedList, type LinkedListNode } from './linked-list.js';
export { LRUCache, LFUCache, TTLCache, type EvictionReason, type LRUCacheOptions, type LFUCacheOptions, type TTLCacheOptions } from './caches.js';
export { SortedMap, SortedSet, type RangeBounds } from './sorted.js';
export { IntervalTree, type IntervalEntry, type IntervalTreeOptions } from './interval-tree.js';
export { Trie, TrieMap, type TrieOptions } from './trie.js';
export { Graph, type GraphOptions, type ShortestPath } from './graph.js';
export { DisjointSet } from './disjoint-set.js';
export { BitSet } from './bitset.js';
export { MultiMap, BiMap, type MultiMapOptions } from './maps.js';
export { BloomFilter, type BloomFilterOptions } from './bloom.js';
export { TypedEventEmitter, type EventMap, type Listener, type TypedEventEmitterOptions } from './emitter.js';
