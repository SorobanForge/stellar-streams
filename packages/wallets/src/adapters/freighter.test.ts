import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreighterAdapter } from './freighter';

// The source imports the CommonJS package's default export, while these tests
// assert on the named ones, so both point at the same mocks.
vi.mock('@stellar/freighter-api', () => {
  const isConnected = vi.fn();
  const getAddress = vi.fn();
  const requestAccess = vi.fn();
  const signTransaction = vi.fn();
  const signAuthEntry = vi.fn();
  const api = { isConnected, getAddress, requestAccess, signTransaction, signAuthEntry };
  return { ...api, default: api };
});

import {
  isConnected,
  getAddress,
  requestAccess,
  signTransaction,
  signAuthEntry,
} from '@stellar/freighter-api';

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

  it('signAuthEntry delegates to freighter API', async () => {
    vi.mocked(signAuthEntry).mockResolvedValue({
      signedAuthEntry: 'signed-entry-xdr',
      signerAddress: 'GB_FREIGHTER',
    });
    const adapter = newAdapter();
    const signed = await adapter.signAuthEntry('entry-xdr', { network: 'MAINNET' });
    expect(signed).toBe('signed-entry-xdr');
    expect(signAuthEntry).toHaveBeenCalledWith('entry-xdr', {
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
      address: '',
    });
  });

  it('signAuthEntry throws when freighter returns no signature', async () => {
    vi.mocked(signAuthEntry).mockResolvedValue({
      signedAuthEntry: null,
      signerAddress: 'GB_FREIGHTER',
    });
    const adapter = newAdapter();
    await expect(adapter.signAuthEntry('entry-xdr')).rejects.toThrow('Failed to sign auth entry.');
  });
});
