import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HanaAdapter } from './hana';

const originalWindow = globalThis.window;

describe('HanaAdapter', () => {
  const adapter = new HanaAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { window?: unknown }).window = {};
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('has id hana and name Hana', () => {
    expect(adapter.id).toBe('hana');
    expect(adapter.name).toBe('Hana');
  });

  it('isAvailable true when window.hanaWallet is defined', async () => {
    (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet = {
      send: vi.fn(),
    };
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable false when window.hanaWallet is undefined', async () => {
    delete (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet;
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('connect retrieves publicKey from object result', async () => {
    (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet = {
      send: vi.fn().mockResolvedValue({ publicKey: 'GB_HANA' }),
    };
    const key = await adapter.connect();
    expect(key).toBe('GB_HANA');
    expect(adapter.getPublicKey()).resolves.toBe('GB_HANA');
  });

  it('connect handles string publicKey result', async () => {
    (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet = {
      send: vi.fn().mockResolvedValue('GB_HANA_STRING'),
    };
    const key = await adapter.connect();
    expect(key).toBe('GB_HANA_STRING');
  });

  it('connect throws when hana missing', async () => {
    delete (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet;
    await expect(adapter.connect()).rejects.toThrow('Hana wallet extension is not installed.');
  });

  it('signTransaction delegates to hana send', async () => {
    (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet = {
      send: vi.fn().mockResolvedValue({ signedTransaction: 'signed-hana-xdr' }),
    };
    const signed = await adapter.signTransaction('xdr', { network: 'MAINNET' });
    expect(signed).toBe('signed-hana-xdr');
    expect(
      (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet!.send,
    ).toHaveBeenCalledWith('stellar:signTransaction', {
      xdr: 'xdr',
      network: 'mainnet',
    });
  });

  it('signTransaction returns string directly when hana returns a string', async () => {
    (globalThis.window as Window & { hanaWallet?: unknown }).hanaWallet = {
      send: vi.fn().mockResolvedValue('signed-hana-string'),
    };
    const signed = await adapter.signTransaction('xdr');
    expect(signed).toBe('signed-hana-string');
  });
});
