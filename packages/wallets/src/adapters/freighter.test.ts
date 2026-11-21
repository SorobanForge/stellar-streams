import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreighterAdapter } from './freighter';
import { createMockWallet } from '../testing/mock-wallet';

const wallet = createMockWallet();

// The adapter loads the SDK with a dynamic `import()`, so this factory runs on
// the first wallet call, after `wallet` is initialised.
vi.mock('@stellar/freighter-api', () => wallet.asFreighterModule());

describe('FreighterAdapter', () => {
  beforeEach(() => {
    wallet.reset();
  });

  function newAdapter(): FreighterAdapter {
    return new FreighterAdapter();
  }

  it('has id freighter and name Freighter', () => {
    const adapter = newAdapter();
    expect(adapter.id).toBe('freighter');
    expect(adapter.name).toBe('Freighter');
  });

  it('isAvailable returns true when connected', async () => {
    const adapter = newAdapter();
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when not connected', async () => {
    wallet.disconnect();
    const adapter = newAdapter();
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('connect retrieves address via requestAccess', async () => {
    wallet.connect('GB_FREIGHTER');
    const adapter = newAdapter();
    const key = await adapter.connect();
    expect(key).toBe('GB_FREIGHTER');
    // getPublicKey asks the extension again instead of serving a cached key.
    await expect(adapter.getPublicKey()).resolves.toBe('GB_FREIGHTER');
    expect(wallet.calls.map((call) => call.args[0])).toEqual(['requestAccess', 'getAddress']);
  });

  it('connect falls back to getAddress when requestAccess fails', async () => {
    wallet.reject('denied');
    const adapter = newAdapter();
    const key = await adapter.connect();
    expect(key).toBe(wallet.address);
    expect(wallet.calls.map((call) => call.args[0])).toEqual(['requestAccess', 'getAddress']);
  });

  it('connect throws when not connected', async () => {
    wallet.disconnect();
    const adapter = newAdapter();
    await expect(adapter.connect()).rejects.toThrow(
      'Freighter wallet extension is not installed or enabled.',
    );
  });

  it('signTransaction delegates to freighter API', async () => {
    wallet.sign('signed-freighter-xdr');
    const adapter = newAdapter();
    const signed = await adapter.signTransaction('xdr', {
      network: 'TESTNET',
      networkPassphrase: 'custom-passphrase',
    });
    expect(signed).toBe('signed-freighter-xdr');
    expect(wallet.calls).toEqual([
      {
        method: 'sign',
        args: ['xdr', { networkPassphrase: 'custom-passphrase', address: '' }],
      },
    ]);
  });

  it('signAuthEntry delegates to freighter API', async () => {
    wallet.signAuthEntry('signed-entry-xdr');
    const adapter = newAdapter();
    const signed = await adapter.signAuthEntry('entry-xdr', { network: 'MAINNET' });
    expect(signed).toBe('signed-entry-xdr');
    expect(wallet.calls).toEqual([
      {
        method: 'signAuthEntry',
        args: [
          'entry-xdr',
          {
            networkPassphrase: 'Public Global Stellar Network ; September 2015',
            address: '',
          },
        ],
      },
    ]);
  });

  it('signAuthEntry throws when freighter returns no signature', async () => {
    wallet.signAuthEntry(null);
    const adapter = newAdapter();
    await expect(adapter.signAuthEntry('entry-xdr')).rejects.toThrow('Failed to sign auth entry.');
  });
});
