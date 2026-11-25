import type { Stream } from '@stellar-starter-kit/types';

/**
 * Optimistic state for stream mutations.
 *
 * `useStream` loads a value from the chain; a withdraw or cancel mutates it,
 * but the next read only reflects the change after the transaction settles and
 * the stream is re-fetched. In between, the UI would show the old balance and
 * read as a failed write. This store keeps the pending changes (ops) separately
 * from the loaded base value and overlays them, so a hook can show the expected
 * result immediately.
 *
 * Every op is independent: rolling one back removes only its changes, which is
 * what keeps concurrent mutations on the same stream from clobbering each
 * other. New ops are applied on top of earlier ones in call order.
 */

/** A change to apply on top of the last loaded stream. */
export type StreamPatch = (stream: Stream) => Partial<Stream>;

interface OptimisticOp {
  id: number;
  apply: StreamPatch;
  /** Set once the transaction confirmed; kept until the refetch lands. */
  settled: boolean;
}

interface Entry {
  ops: OptimisticOp[];
  listeners: Set<() => void>;
  refreshers: Set<() => void | Promise<void>>;
}

// Scoped by client (like the request cache) so two clients never share state.
let stores = new WeakMap<object, Map<string, Entry>>();
let nextOpId = 1;

function entryFor(scope: object, key: string): Entry {
  let store = stores.get(scope);
  if (!store) {
    store = new Map();
    stores.set(scope, store);
  }
  let entry = store.get(key);
  if (!entry) {
    entry = { ops: [], listeners: new Set(), refreshers: new Set() };
    store.set(key, entry);
  }
  return entry;
}

/** Notifies every hook displaying this stream; used after a rollback. */
function notify(entry: Entry): void {
  for (const listener of entry.listeners) listener();
}

/** Applies every pending op to `base`, in the order the mutations were made. */
export function applyOptimistic(scope: object, key: string, base: Stream | null): Stream | null {
  if (base === null) return null;
  const entry = stores.get(scope)?.get(key);
  if (!entry || entry.ops.length === 0) return base;

  let next = base;
  for (const op of entry.ops) next = { ...next, ...op.apply(next) };
  return next;
}

/** Records an optimistic change and returns its id. */
export function pushOptimistic(scope: object, key: string, apply: StreamPatch): number {
  const entry = entryFor(scope, key);
  const id = nextOpId++;
  entry.ops.push({ id, apply, settled: false });
  notify(entry);
  return id;
}

/**
 * Marks an op as confirmed. It stays overlaid until the refetch replaces the
 * base value (`clearSettledOptimistic`), so the UI never flickers back to the
 * pre-transaction value while the refresh is in flight.
 */
export function settleOptimistic(scope: object, key: string, id: number): void {
  const entry = stores.get(scope)?.get(key);
  if (!entry) return;
  const op = entry.ops.find((candidate) => candidate.id === id);
  if (!op) return;
  // With nothing mounted there is no display to keep stable: commit it now.
  if (entry.listeners.size === 0) {
    entry.ops = entry.ops.filter((candidate) => candidate.id !== id);
    return;
  }
  op.settled = true;
}

/** Drops an op, restoring the previous value for the fields it changed. */
export function rollbackOptimistic(scope: object, key: string, id: number): void {
  const entry = stores.get(scope)?.get(key);
  if (!entry) return;
  const remaining = entry.ops.filter((op) => op.id !== id);
  if (remaining.length === entry.ops.length) return;
  entry.ops = remaining;
  notify(entry);
}

/** Removes ops whose transaction already confirmed, after a fresh read. */
export function clearSettledOptimistic(scope: object, key: string): void {
  const entry = stores.get(scope)?.get(key);
  if (!entry) return;
  const remaining = entry.ops.filter((op) => !op.settled);
  if (remaining.length !== entry.ops.length) entry.ops = remaining;
}

/** Subscribes a display hook to op changes for one stream. */
export function subscribeOptimistic(scope: object, key: string, listener: () => void): () => void {
  const entry = entryFor(scope, key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/** Registers a refetch to run when a mutation for this stream settles. */
export function registerOptimisticRefresh(
  scope: object,
  key: string,
  refresh: () => void | Promise<void>,
): () => void {
  const entry = entryFor(scope, key);
  entry.refreshers.add(refresh);
  return () => {
    entry.refreshers.delete(refresh);
  };
}

/** Asks every mounted reader of this stream to re-read it after a write. */
export async function notifyOptimisticRefresh(scope: object, key: string): Promise<void> {
  const entry = stores.get(scope)?.get(key);
  if (!entry) return;
  await Promise.all(
    [...entry.refreshers].map(async (refresh) => {
      try {
        await refresh();
      } catch {
        // A failed refetch leaves the optimistic value in place; the next
        // successful read reconciles it.
      }
    }),
  );
}

/** Drops every entry. In-flight transactions simply lose their display. */
export function clearOptimisticState(): void {
  stores = new WeakMap<object, Map<string, Entry>>();
}
