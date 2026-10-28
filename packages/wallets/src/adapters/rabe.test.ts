import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RabetAdapter } from './rabe';
import { WalletCancelledError, WalletRejectedError } from '../errors';

const originalWindow = globalThis.window;

describe('RabetAdapter', () => {
  const adapter = new RabetAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { window?: unknown }).window = {};
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('has id rabe and name Rabet', () => {
    expect(adapter.id).toBe('rabe');
    expect(adapter.name).toBe('Rabet');
  });

  it('isAvailable true when window.rabet is defined', async () => {
    (globalThis.window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn(),
      sign: vi.fn(),
    };
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable false when window.rabet is undefined', async () => {
    delete (globalThis.window as Window & { rabet?: unknown }).rabet;
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('connect retrieves publicKey', async () => {
    (globalThis.window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
      sign: vi.fn(),
    };
    const key = await adapter.connect();
    expect(key).toBe('GB_RABET');
    expect(adapter.getPublicKey()).resolves.toBe('GB_RABET');
  });

  it('connect throws when rabet missing', async () => {
    delete (globalThis.window as Window & { rabet?: unknown }).rabet;
    await expect(adapter.connect()).rejects.toThrow('Rabet wallet extension is not installed.');
  });

  it('signTransaction delegates to rabet sign', async () => {
    (globalThis.window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
      sign: vi.fn().mockResolvedValue('signed-rabet-xdr'),
    };
    const signed = await adapter.signTransaction('xdr', { network: 'MAINNET' });
    expect(signed).toBe('signed-rabet-xdr');
    expect((globalThis.window as Window & { rabet?: unknown }).rabet!.sign).toHaveBeenCalledWith(
      'xdr',
      'mainnet',
    );
  });

  it('maps a rejected signing request to a typed rejection error', async () => {
    (globalThis.window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn(),
      sign: vi.fn().mockRejectedValue({ error: 'User rejected the request.' }),
    };

    const error = await adapter.signTransaction('xdr').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WalletRejectedError);
    expect(error).toMatchObject({
      name: 'WalletRejectedError',
      code: 'WALLET_REJECTED',
      message: 'User rejected the request.',
    });
  });

  it('maps a cancelled signing request to a typed cancellation error', async () => {
    (globalThis.window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn(),
      sign: vi.fn().mockRejectedValue(new Error('Request cancelled by the user.')),
    };

    const error = await adapter.signTransaction('xdr').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WalletCancelledError);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WalletRejectedError);
    expect(error).toMatchObject({
      name: 'WalletCancelledError',
      code: 'WALLET_CANCELLED',
      message: 'Request cancelled by the user.',
    });
  });

  it('keeps unclassified signing failures as plain errors', async () => {
    (globalThis.window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn(),
      sign: vi.fn().mockRejectedValue(new Error('Wallet is locked.')),
    };

    const error = await adapter.signTransaction('xdr').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WalletRejectedError);
    expect(error).not.toBeInstanceOf(WalletCancelledError);
    expect((error as Error).message).toBe('Wallet is locked.');
  });

  it('disconnect revokes the Rabet session', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    (globalThis.window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
      sign: vi.fn(),
      disconnect,
    };

    await adapter.connect();
    await adapter.disconnect();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnect is a no-op when the extension is missing', async () => {
    delete (globalThis.window as Window & { rabet?: unknown }).rabet;
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
