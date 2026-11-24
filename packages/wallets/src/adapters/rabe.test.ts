import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RabetAdapter } from './rabe';
import { WalletCancelledError, WalletRejectedError } from '../errors';
import { createMockWallet } from '../testing/mock-wallet';

const originalWindow = globalThis.window;
const wallet = createMockWallet();

type RabetWindow = Window & { rabet?: ReturnType<typeof wallet.asRabetProvider> };

describe('RabetAdapter', () => {
  const adapter = new RabetAdapter();

  beforeEach(() => {
    wallet.reset();
    (globalThis as { window?: unknown }).window = {};
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  function installRabet(): void {
    (globalThis.window as RabetWindow).rabet = wallet.asRabetProvider();
  }

  it('has id rabe and name Rabet', () => {
    expect(adapter.id).toBe('rabe');
    expect(adapter.name).toBe('Rabet');
  });

  it('isAvailable true when window.rabet is defined', async () => {
    installRabet();
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable false when window.rabet is undefined', async () => {
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('connect retrieves publicKey', async () => {
    installRabet();
    wallet.connect('GB_RABET');
    const key = await adapter.connect();
    expect(key).toBe('GB_RABET');
    await expect(adapter.getPublicKey()).resolves.toBe('GB_RABET');
    expect(wallet.calls.map((call) => call.method)).toEqual(['connect', 'connect']);
  });

  it('connect throws when rabet missing', async () => {
    await expect(adapter.connect()).rejects.toThrow('Rabet wallet extension is not installed.');
  });

  it('signTransaction delegates to rabet sign', async () => {
    installRabet();
    wallet.sign('signed-rabet-xdr');
    const signed = await adapter.signTransaction('xdr', { network: 'MAINNET' });
    expect(signed).toBe('signed-rabet-xdr');
    expect(wallet.calls).toEqual([{ method: 'sign', args: ['xdr', 'mainnet'] }]);
  });

  it('maps a rejected signing request to a typed rejection error', async () => {
    installRabet();
    wallet.reject();

    const error = await adapter.signTransaction('xdr').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(WalletRejectedError);
    expect(error).toMatchObject({
      name: 'WalletRejectedError',
      code: 'WALLET_REJECTED',
      message: 'User rejected the request.',
    });
  });

  it('maps a cancelled signing request to a typed cancellation error', async () => {
    installRabet();
    wallet.reject('Request cancelled by the user.');

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
    installRabet();
    wallet.reject('Wallet is locked.');

    const error = await adapter.signTransaction('xdr').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WalletRejectedError);
    expect(error).not.toBeInstanceOf(WalletCancelledError);
    expect((error as Error).message).toBe('Wallet is locked.');
  });

  it('disconnect revokes the Rabet session', async () => {
    installRabet();
    await adapter.connect();
    await adapter.disconnect();

    expect(wallet.calls.filter((call) => call.method === 'disconnect')).toHaveLength(1);
  });

  it('disconnect is a no-op when the extension is missing', async () => {
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
