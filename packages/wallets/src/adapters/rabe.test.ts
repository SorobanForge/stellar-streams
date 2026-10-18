import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RabetAdapter } from './rabe';

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
});
