import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@albedo-link/intent', () => ({
  default: {
    publicKey: vi.fn(),
    tx: vi.fn(),
  },
}));

import albedo from '@albedo-link/intent';
import { AlbedoAdapter } from './albedo';

describe('AlbedoAdapter', () => {
  const adapter = new AlbedoAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has id albedo and name Albedo', () => {
    expect(adapter.id).toBe('albedo');
    expect(adapter.name).toBe('Albedo');
  });

  it('isAvailable true when publicKey is a function', async () => {
    vi.mocked(albedo.publicKey).mockResolvedValue({
      pubkey: 'GB_ALBEDO',
      signature: '',
      signed_message: '',
    } as unknown as Awaited<ReturnType<typeof albedo.publicKey>>);
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('connect retrieves pubkey', async () => {
    vi.mocked(albedo.publicKey).mockResolvedValue({
      pubkey: 'GB_ALBEDO',
      signature: '',
      signed_message: '',
    } as unknown as Awaited<ReturnType<typeof albedo.publicKey>>);
    const key = await adapter.connect();
    expect(key).toBe('GB_ALBEDO');
    expect(adapter.getPublicKey()).resolves.toBe('GB_ALBEDO');
  });

  it('connect throws when no pubkey', async () => {
    vi.mocked(albedo.publicKey).mockResolvedValue({
      pubkey: '',
      signature: '',
      signed_message: '',
    } as unknown as Awaited<ReturnType<typeof albedo.publicKey>>);
    await expect(adapter.connect()).rejects.toThrow('Failed to retrieve public key from wallet.');
  });

  it('signTransaction delegates to albedo tx', async () => {
    vi.mocked(albedo.tx).mockResolvedValue({
      signed_envelope_xdr: 'signed-albedo-xdr',
      tx_hash: 'hash',
      xdr: 'xdr',
      network: 'testnet',
      result: 'ok',
    } as unknown as Awaited<ReturnType<typeof albedo.tx>>);
    const signed = await adapter.signTransaction('xdr', { network: 'MAINNET' });
    expect(signed).toBe('signed-albedo-xdr');
    expect(albedo.tx).toHaveBeenCalledWith({ xdr: 'xdr', network: 'mainnet' });
  });
});
