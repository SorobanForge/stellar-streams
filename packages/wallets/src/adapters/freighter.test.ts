import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreighterAdapter } from './freighter';

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

import { isConnected, getAddress, requestAccess, signTransaction } from '@stellar/freighter-api';

describe('FreighterAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true });
    const adapter = newAdapter();
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when not connected', async () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: false });
    const adapter = newAdapter();
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('connect retrieves address via requestAccess', async () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    const adapter = newAdapter();
    const key = await adapter.connect();
    expect(key).toBe('GB_FREIGHTER');
    expect(adapter.getPublicKey()).resolves.toBe('GB_FREIGHTER');
  });

  it('connect falls back to getAddress when requestAccess fails', async () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(requestAccess).mockRejectedValue(new Error('denied'));
    vi.mocked(getAddress).mockResolvedValue({ address: 'GB_FALLBACK' });
    const adapter = newAdapter();
    const key = await adapter.connect();
    expect(key).toBe('GB_FALLBACK');
  });

  it('connect throws when not connected', async () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: false });
    const adapter = newAdapter();
    await expect(adapter.connect()).rejects.toThrow(
      'Freighter wallet extension is not installed or enabled.',
    );
  });

  it('signTransaction delegates to freighter API', async () => {
    vi.mocked(signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GB_FREIGHTER',
    });
    const adapter = newAdapter();
    const signed = await adapter.signTransaction('xdr', {
      network: 'TESTNET',
      networkPassphrase: 'custom-passphrase',
    });
    expect(signed).toBe('signed-xdr');
    expect(signTransaction).toHaveBeenCalledWith('xdr', {
      networkPassphrase: 'custom-passphrase',
      address: '',
    });
  });
});
