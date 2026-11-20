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
        sign: vi.fn().mockResolvedValue({ xdr: 'signed-rabet-xdr' }),
        disconnect: vi.fn().mockResolvedValue(undefined),
      },
    };
  },
  setupUnavailable: () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
  },
  setupUserRejection: () => {
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window;
    const rabet = win.rabet as Record<string, unknown> | undefined;
    if (rabet) {
      rabet.sign = vi.fn().mockRejectedValue(new Error('User rejected'));
    }
  },
  setupMalformedXdr: () => {
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window;
    const rabet = win.rabet as Record<string, unknown> | undefined;
    if (rabet) {
      rabet.sign = vi.fn().mockRejectedValue(new Error('Malformed XDR'));
    }
  },
  setupNetworkMismatch: () => {
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window;
    const rabet = win.rabet as Record<string, unknown> | undefined;
    if (rabet) {
      rabet.sign = vi.fn().mockRejectedValue(new Error('Network mismatch'));
    }
  },
  setupDisconnect: () => {
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window;
    const rabet = win.rabet as Record<string, unknown> | undefined;
    return { disconnectSpy: rabet?.disconnect as unknown };
  },
});
