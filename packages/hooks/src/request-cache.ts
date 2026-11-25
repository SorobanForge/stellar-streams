/**
 * A tiny in-flight request cache.
 *
 * Mounting the dashboard renders several components that each call `useStream`
 * with the same client and id in the same tick. Without sharing, every hook
 * fires its own `getStream` / `claimable` simulation for identical data. This
 * cache keeps the pending promise for a read so concurrent callers await the
 * same RPC round-trip.
 *
 * Only *pending* work is cached. The entry is removed as soon as the promise
 * settles, which means:
 * - a later read always hits the network again (no stale data), and
 * - a rejected read is not remembered, so the next call retries.
 *
 * Callers that need to bypass the cache (for example a manual `refresh()` after
 * a write) simply call their loader directly instead of `dedupeRequest`.
 */

type PendingRequest = Promise<unknown>;

/** Pending reads grouped by the object they were issued against (usually a client). */
let buckets = new WeakMap<object, Map<string, PendingRequest>>();

/** Used for primitive/no scope, so a shared key still resolves to one bucket. */
let fallbackBucket = new Map<string, PendingRequest>();

function bucketFor(scope: object | null | undefined): Map<string, PendingRequest> {
  if (scope === null || typeof scope !== 'object') return fallbackBucket;
  let bucket = buckets.get(scope);
  if (!bucket) {
    bucket = new Map<string, PendingRequest>();
    buckets.set(scope, bucket);
  }
  return bucket;
}

/**
 * Shares one in-flight promise per `scope` + `key`.
 *
 * `scope` is normally the client instance, so two different clients never
 * share a read even when they ask for the same id. The loader runs exactly once
 * per pending key; every caller receives the same promise.
 */
export function dedupeRequest<T>(
  scope: object | null | undefined,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const bucket = bucketFor(scope);
  const pending = bucket.get(key);
  if (pending) return pending as Promise<T>;

  // Running the loader inside the executor turns a synchronous throw into a
  // rejection, so callers always get a promise back.
  const promise = new Promise<T>((resolve) => resolve(load()));
  bucket.set(key, promise as PendingRequest);

  // Drop the entry once it settles. `then(onFulfilled, onRejected)` also keeps
  // the settlement handled here, so the bookkeeping itself cannot surface as an
  // unhandled rejection.
  const release = () => {
    if (bucket.get(key) === promise) bucket.delete(key);
  };
  promise.then(release, release);

  return promise;
}

/**
 * Drops every pending entry. In-flight promises keep running and their callers
 * still receive the result; the cache simply stops sharing them. Swapping in
 * empty maps is the only way to clear a WeakMap.
 */
export function clearRequestCache(): void {
  buckets = new WeakMap<object, Map<string, PendingRequest>>();
  fallbackBucket = new Map<string, PendingRequest>();
}

/** Number of cached (pending) reads for a scope. Exposed for tests and diagnostics. */
export function pendingRequestCount(scope: object | null | undefined): number {
  if (scope === null || typeof scope !== 'object') return fallbackBucket.size;
  return buckets.get(scope)?.size ?? 0;
}
