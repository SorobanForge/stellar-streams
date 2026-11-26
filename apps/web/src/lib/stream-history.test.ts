// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  RECENT_STREAMS_LIMIT,
  clearRecentStreams,
  readRecentStreams,
  recentStreamsKey,
  rememberRecentStream,
  type RecentStreamStorage,
} from './stream-history';

/** An in-memory `localStorage` stand-in. */
function memoryStorage(initial: Record<string, string> = {}): RecentStreamStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

/** A storage that throws on every operation, like a disabled localStorage. */
const brokenStorage: RecentStreamStorage = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('quota exceeded');
  },
  removeItem: () => {
    throw new Error('storage disabled');
  },
};

describe('stream lookup history', () => {
  it('persists ids newest-first per network', () => {
    const storage = memoryStorage();

    rememberRecentStream('testnet', '1', storage);
    rememberRecentStream('testnet', '2', storage);

    expect(readRecentStreams('testnet', storage)).toEqual(['2', '1']);
    // Same key format, but a different network has an independent list.
    expect(readRecentStreams('mainnet', storage)).toEqual([]);
    expect(storage.data[recentStreamsKey('testnet')]).toBe('["2","1"]');
  });

  it('moves a repeated id to the front without duplicating it', () => {
    const storage = memoryStorage();
    rememberRecentStream('testnet', '1', storage);
    rememberRecentStream('testnet', '2', storage);
    rememberRecentStream('testnet', '1', storage);

    expect(readRecentStreams('testnet', storage)).toEqual(['1', '2']);
  });

  it('keeps at most five ids', () => {
    const storage = memoryStorage();
    for (const id of ['1', '2', '3', '4', '5', '6']) {
      rememberRecentStream('testnet', id, storage);
    }

    expect(readRecentStreams('testnet', storage)).toHaveLength(RECENT_STREAMS_LIMIT);
    expect(readRecentStreams('testnet', storage)).toEqual(['6', '5', '4', '3', '2']);
  });

  it('ignores malformed stored values and non-numeric ids', () => {
    const notJson = memoryStorage({ [recentStreamsKey('testnet')]: 'not-json' });
    expect(readRecentStreams('testnet', notJson)).toEqual([]);

    const notAList = memoryStorage({ [recentStreamsKey('testnet')]: '{"id":1}' });
    expect(readRecentStreams('testnet', notAList)).toEqual([]);

    const mixed = memoryStorage({ [recentStreamsKey('testnet')]: '["7","nope","7",8]' });
    expect(readRecentStreams('testnet', mixed)).toEqual(['7']);

    expect(rememberRecentStream('testnet', 'not-an-id', memoryStorage())).toEqual([]);
  });

  it('survives a storage exception when reading and writing', () => {
    expect(readRecentStreams('testnet', brokenStorage)).toEqual([]);
    expect(() => rememberRecentStream('testnet', '9', brokenStorage)).not.toThrow();
    expect(rememberRecentStream('testnet', '9', brokenStorage)).toEqual(['9']);
    expect(() => clearRecentStreams('testnet', brokenStorage)).not.toThrow();
  });

  it('does not touch the DOM during SSR', () => {
    // In the Vitest node environment `window` is undefined, so every helper
    // runs its guarded no-storage path.
    expect(typeof window).toBe('undefined');
    expect(readRecentStreams('testnet')).toEqual([]);
    expect(rememberRecentStream('testnet', '3')).toEqual(['3']);
    expect(() => clearRecentStreams('testnet')).not.toThrow();
  });

  it('clears only the selected network', () => {
    const storage = memoryStorage();
    rememberRecentStream('testnet', '1', storage);
    rememberRecentStream('mainnet', '2', storage);

    clearRecentStreams('testnet', storage);

    expect(readRecentStreams('testnet', storage)).toEqual([]);
    expect(readRecentStreams('mainnet', storage)).toEqual(['2']);
  });

  it('swallows a quota error and still returns the session list', () => {
    const setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    const storage = {
      getItem: () => null,
      setItem,
      removeItem: () => {},
    };

    expect(rememberRecentStream('testnet', '11', storage)).toEqual(['11']);
    expect(setItem).toHaveBeenCalledOnce();
  });
});
