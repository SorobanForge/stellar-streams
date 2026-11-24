import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlbedoAdapter } from './albedo';
import type { WalletAdapter } from './adapter';
import { createMockWallet } from '../testing/mock-wallet';

const wallet = createMockWallet();

// The adapter loads the SDK with a dynamic `import()`, so this factory runs on
// the first wallet call, after `wallet` is initialised.
vi.mock('@albedo-link/intent', () => wallet.asAlbedoModule());

describe('AlbedoAdapter', () => {
  const adapter = new AlbedoAdapter();

  beforeEach(() => {
    wallet.reset();
  });

  it('has id albedo and name Albedo', () => {
    expect(adapter.id).toBe('albedo');
    expect(adapter.name).toBe('Albedo');
  });

  it('isAvailable true when the intent client exposes publicKey', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('connect retrieves pubkey', async () => {
    wallet.connect('GB_ALBEDO');
    const key = await adapter.connect();
    expect(key).toBe('GB_ALBEDO');
    await expect(adapter.getPublicKey()).resolves.toBe('GB_ALBEDO');
    expect(wallet.calls.map((call) => call.method)).toEqual(['connect', 'connect']);
  });

  it('connect throws when no pubkey', async () => {
    wallet.connect('');
    await expect(adapter.connect()).rejects.toThrow('Failed to retrieve public key from wallet.');
  });

  it('does not expose auth-entry signing', () => {
    expect((adapter as WalletAdapter).signAuthEntry).toBeUndefined();
  });

  it('signTransaction delegates to albedo tx', async () => {
    wallet.sign('signed-albedo-xdr');
    const signed = await adapter.signTransaction('xdr', { network: 'MAINNET' });
    expect(signed).toBe('signed-albedo-xdr');
    expect(wallet.calls).toEqual([{ method: 'sign', args: ['xdr', { network: 'mainnet' }] }]);
  });
});
