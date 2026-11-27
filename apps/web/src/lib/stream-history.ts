/**
 * Recent stream ids, one list per network.
 *
 * Every access is defensive: the module is imported by a client component that
 * also renders on the server, and `localStorage` can throw (Safari private
 * browsing, a disabled storage policy, or a full quota). A storage failure
 * degrades to an in-memory list instead of breaking the dashboard.
 */

/** How many ids are kept per network. */
export const RECENT_STREAMS_LIMIT = 5;

/** Prefix shared by every network's key. */
export const RECENT_STREAMS_STORAGE_PREFIX = 'stellar-streams:recent-lookups:';

/** The small part of `Storage` this module needs, so tests can pass a fake. */
export interface RecentStreamStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Storage key for a network, e.g. `...:testnet`. */
export function recentStreamsKey(network: string): string {
  return `${RECENT_STREAMS_STORAGE_PREFIX}${network.trim().toLowerCase() || 'testnet'}`;
}

/** Returns `localStorage` in a browser, or `null` during SSR. */
function browserStorage(): RecentStreamStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Stream ids are decimal u64 values; anything else is not a useful hint. */
function isStreamId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

/**
 * Reads the stored ids for `network`.
 *
 * Missing, malformed, or unreadable storage returns an empty list. The result
 * is de-duplicated and capped so an old oversized entry cannot break the UI.
 */
export function readRecentStreams(
  network: string,
  storage: RecentStreamStorage | null = browserStorage(),
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(recentStreamsKey(network));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter(isStreamId))].slice(0, RECENT_STREAMS_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Moves `id` to the front of the list and returns the updated list.
 *
 * A write failure is swallowed: the returned list is still correct for this
 * session, and the next successful write persists it.
 */
export function rememberRecentStream(
  network: string,
  id: string,
  storage: RecentStreamStorage | null = browserStorage(),
): string[] {
  const trimmed = id.trim();
  if (!isStreamId(trimmed)) return readRecentStreams(network, storage);

  const next = [
    trimmed,
    ...readRecentStreams(network, storage).filter((existing) => existing !== trimmed),
  ].slice(0, RECENT_STREAMS_LIMIT);

  if (!storage) return next;
  try {
    storage.setItem(recentStreamsKey(network), JSON.stringify(next));
  } catch {
    // Quota exceeded or storage disabled; the in-memory list is still usable.
  }
  return next;
}

/** Empties the stored list for `network`. */
export function clearRecentStreams(
  network: string,
  storage: RecentStreamStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(recentStreamsKey(network));
  } catch {
    // A storage that cannot be read cannot be cleared; nothing to do.
  }
}
