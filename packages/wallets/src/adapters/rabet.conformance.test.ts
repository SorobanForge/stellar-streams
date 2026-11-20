import { vi } from 'vitest';
import { RabetAdapter } from './rabet';
import { runAdapterConformanceSuite } from './conformance.test';

runAdapterConformanceSuite({
  name: 'RabetAdapter',
  createAdapter: () => new RabetAdapter(),
  setupAvailable: () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      rabet: {
        connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
        sign: vi.fn().mockResolvedValue('signed-rabet-xdr'),
        disconnect: vi.fn().mockResolvedValue(undefined),
      },
    };
  },
  setupUnavailable: () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
  },
  setupUserRejection: () => {
    const win = (globalThis as unknown as { window: Record<string, any> }).window;
    win.rabet.sign = vi.fn().mockRejectedValue(new Error('User rejected'));
  },
  setupMalformedXdr: () => {
    const win = (globalThis as unknown as { window: Record<string, any> }).window;
    win.rabet.sign = vi.fn().mockRejectedValue(new Error('Malformed XDR'));
  },
  setupNetworkMismatch: () => {
    const win = (globalThis as unknown as { window: Record<string, any> }).window;
    win.rabet.sign = vi.fn().mockRejectedValue(new Error('Network mismatch'));
  },
  setupDisconnect: () => {
    const win = (globalThis as unknown as { window: Record<string, any> }).window;
    return { disconnectSpy: win.rabet.disconnect };
  },
});
