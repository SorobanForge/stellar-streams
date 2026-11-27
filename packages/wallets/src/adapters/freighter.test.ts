import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreighterAdapter } from './freighter';
import { WalletLockedError } from '../errors';

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
    vi.mocked(getAddress).mockResolvedValue({ address: 'GB_FREIGHTER' });
    const adapter = newAdapter();
    const key = await adapter.connect();
    expect(key).toBe('GB_FREIGHTER');
    // getPublicKey asks the extension again instead of serving a cached key.
    await expect(adapter.getPublicKey()).resolves.toBe('GB_FREIGHTER');
    expect(getAddress).toHaveBeenCalledTimes(1);
  });

  it('connect falls back to getAddress when requestAccess fails', async () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(requestAccess).mockRejectedValue(new Error('denied'));
    vi.mocked(getAddress).mockResolvedValue({ address: 'GB_FALLBACK' });
    const adapter = newAdapter();
    const key = await adapter.connect();
    expect(key).toBe('GB_FALLBACK');
  });

  it('maps a locked extension during connect to WalletLockedError', async () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(requestAccess).mockRejectedValue(new Error('Wallet is locked'));
    const adapter = newAdapter();

    const error = await adapter.connect().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WalletLockedError);
    expect((error as WalletLockedError).code).toBe('WALLET_LOCKED');
    expect((error as WalletLockedError).message).toContain('Unlock the extension');
    // A locked wallet must not be mistaken for a denied request and retried.
    expect(getAddress).not.toHaveBeenCalled();
  });

  it('passes an unrelated connect failure through unchanged', async () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(requestAccess).mockRejectedValue(new Error('Network unavailable'));
    vi.mocked(getAddress).mockResolvedValue({ address: 'GB_FALLBACK' });
    const adapter = newAdapter();

    await expect(adapter.connect()).resolves.toBe('GB_FALLBACK');
  });

  it('maps a locked extension while signing', async () => {
    vi.mocked(signTransaction).mockRejectedValue(new Error('Please unlock your wallet.'));
    const adapter = newAdapter();

    const error = await adapter.signTransaction('xdr', { network: 'TESTNET' }).catch((err) => err);

    expect(error).toBeInstanceOf(WalletLockedError);
    expect((error as WalletLockedError).message).toBe(
      'Freighter wallet is locked. Unlock the extension and try again.',
    );
  });

  it('does not remap unrelated signing failures', async () => {
    vi.mocked(signTransaction).mockRejectedValue(new Error('User rejected the request.'));
    const adapter = newAdapter();

    const error = await adapter.signTransaction('xdr').catch((err) => err);

    expect((error as Error).message).toBe('User rejected the request.');
    expect(error).not.toBeInstanceOf(WalletLockedError);
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
