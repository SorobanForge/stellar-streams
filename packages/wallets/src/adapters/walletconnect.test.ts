import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WalletConnectAdapter,
  parseCaip10Address,
  toStellarChainId,
  STELLAR_CHAIN_TESTNET,
  STELLAR_CHAIN_PUBKEY,
  type WalletConnectClient,
  type WalletConnectSession,
} from './walletconnect';
import { WalletCancelledError, WalletRejectedError } from '../errors';

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

describe('WalletConnectAdapter', () => {
  let mockStorage: Record<string, string> = {};

  const sampleSession: WalletConnectSession = {
    topic: 'mock-topic-123',
    namespaces: {
      stellar: {
        accounts: ['stellar:pubnet:GB_MOCK_WALLETCONNECT_PUBLIC_KEY'],
        methods: ['stellar_signXDR', 'stellar_signTransaction', 'stellar_signAuthEntry'],
        events: [],
      },
    },
  };

  let mockClient: WalletConnectClient;
  let clientLoader: () => Promise<WalletConnectClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};

    globalThis.localStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: () => null,
    } as unknown as Storage;

    (globalThis as { window?: unknown }).window = {
      location: { origin: 'http://localhost:3000' },
    };

    mockClient = {
      session: {
        getAll: vi.fn().mockReturnValue([]),
        get: vi.fn().mockImplementation((topic: string) => {
          if (topic === sampleSession.topic) return sampleSession;
          throw new Error('No session');
        }),
      },
      connect: vi.fn().mockResolvedValue({
        uri: 'wc:test-uri-123@2',
        approval: vi.fn().mockResolvedValue(sampleSession),
      }),
      request: vi.fn().mockResolvedValue({ signedXDR: 'signed-wc-xdr' }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    clientLoader = vi.fn().mockResolvedValue(mockClient);
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  });

  describe('helper functions', () => {
    it('parseCaip10Address parses account correctly', () => {
      expect(parseCaip10Address('stellar:pubnet:GABC123')).toBe('GABC123');
      expect(parseCaip10Address('stellar:testnet:GXYZ456')).toBe('GXYZ456');
      expect(parseCaip10Address('GRAWADDRESS')).toBe('GRAWADDRESS');
    });

    it('toStellarChainId maps testnet and pubnet', () => {
      expect(toStellarChainId({ network: 'TESTNET' })).toBe(STELLAR_CHAIN_TESTNET);
      expect(toStellarChainId({ network: 'MAINNET' })).toBe(STELLAR_CHAIN_PUBKEY);
    });
  });

  it('has id walletconnect and name WalletConnect', () => {
    const adapter = new WalletConnectAdapter({ clientLoader });
    expect(adapter.id).toBe('walletconnect');
    expect(adapter.name).toBe('WalletConnect');
  });

  it('isAvailable returns true in window/browser environment', async () => {
    const adapter = new WalletConnectAdapter({ clientLoader });
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('connect triggers client.connect and emits uri via onUri callback', async () => {
    const onUri = vi.fn();
    const adapter = new WalletConnectAdapter({ clientLoader, onUri });

    const key = await adapter.connect();

    expect(key).toBe('GB_MOCK_WALLETCONNECT_PUBLIC_KEY');
    expect(onUri).toHaveBeenCalledWith('wc:test-uri-123@2');
    expect(mockStorage['stellar_streams_wc_topic']).toBe('mock-topic-123');
  });

  it('connect reuses existing session when client has active sessions', async () => {
    mockClient.session.getAll = vi.fn().mockReturnValue([sampleSession]);
    const adapter = new WalletConnectAdapter({ clientLoader });

    const key = await adapter.connect();

    expect(key).toBe('GB_MOCK_WALLETCONNECT_PUBLIC_KEY');
    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it('connect maps user disapproval to WalletRejectedError', async () => {
    mockClient.connect = vi.fn().mockResolvedValue({
      approval: vi.fn().mockRejectedValue(new Error('User disapproved session proposal')),
    });
    const adapter = new WalletConnectAdapter({ clientLoader });

    await expect(adapter.connect()).rejects.toThrow(WalletRejectedError);
  });

  it('connect maps user cancellation or timeout to WalletCancelledError', async () => {
    mockClient.connect = vi.fn().mockResolvedValue({
      approval: vi.fn().mockRejectedValue(new Error('Connection request timed out or cancelled')),
    });
    const adapter = new WalletConnectAdapter({ clientLoader });

    await expect(adapter.connect()).rejects.toThrow(WalletCancelledError);
  });

  it('getPublicKey restores session from localStorage', async () => {
    mockStorage['stellar_streams_wc_topic'] = 'mock-topic-123';
    const adapter = new WalletConnectAdapter({ clientLoader });

    const key = await adapter.getPublicKey();

    expect(key).toBe('GB_MOCK_WALLETCONNECT_PUBLIC_KEY');
    expect(mockClient.session.get).toHaveBeenCalledWith('mock-topic-123');
  });

  it('signTransaction delegates request to client and returns signed envelope', async () => {
    const adapter = new WalletConnectAdapter({ clientLoader });
    await adapter.connect();

    const signed = await adapter.signTransaction('mock-xdr', { network: 'TESTNET' });

    expect(signed).toBe('signed-wc-xdr');
    expect(mockClient.request).toHaveBeenCalledWith({
      topic: 'mock-topic-123',
      chainId: STELLAR_CHAIN_TESTNET,
      request: {
        method: 'stellar_signXDR',
        params: {
          xdr: 'mock-xdr',
          networkPassphrase: 'Test SDF Network ; September 2015',
        },
      },
    });
  });

  it('signTransaction maps user denial to WalletRejectedError', async () => {
    const adapter = new WalletConnectAdapter({ clientLoader });
    await adapter.connect();

    mockClient.request = vi.fn().mockRejectedValue(new Error('User denied transaction'));

    await expect(adapter.signTransaction('mock-xdr')).rejects.toThrow(WalletRejectedError);
  });

  it('signAuthEntry delegates request and returns signed auth entry', async () => {
    mockClient.request = vi.fn().mockResolvedValue({ signedAuthEntry: 'signed-wc-auth-xdr' });
    const adapter = new WalletConnectAdapter({ clientLoader });
    await adapter.connect();

    const signed = await adapter.signAuthEntry('mock-entry-xdr', { network: 'TESTNET' });

    expect(signed).toBe('signed-wc-auth-xdr');
    expect(mockClient.request).toHaveBeenCalledWith({
      topic: 'mock-topic-123',
      chainId: STELLAR_CHAIN_TESTNET,
      request: {
        method: 'stellar_signAuthEntry',
        params: {
          entryXdr: 'mock-entry-xdr',
          networkPassphrase: 'Test SDF Network ; September 2015',
        },
      },
    });
  });

  it('disconnect terminates session and cleans up storage', async () => {
    const adapter = new WalletConnectAdapter({ clientLoader });
    await adapter.connect();
    expect(mockStorage['stellar_streams_wc_topic']).toBe('mock-topic-123');

    await adapter.disconnect();

    expect(mockClient.disconnect).toHaveBeenCalledWith({
      topic: 'mock-topic-123',
      reason: expect.objectContaining({ code: 6000 }),
    });
    expect(mockStorage['stellar_streams_wc_topic']).toBeUndefined();
  });
});
