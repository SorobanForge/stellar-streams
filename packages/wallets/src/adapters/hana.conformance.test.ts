import { describe, vi } from 'vitest';
import { HanaAdapter } from './hana';
import { runAdapterConformanceSuite } from './conformance.test';

const originalWindow = (globalThis as { window?: unknown }).window;

runAdapterConformanceSuite({
  name: 'HanaAdapter',
  createAdapter: () => new HanaAdapter(),
  setupAvailable: () => {
    (globalThis as { window: unknown }).window = {
      hanaWallet: {
        send: vi.fn().mockResolvedValue({ publicKey: 'GB_HANA' }),
      },
    };
  },
  setupUnavailable: () => {
    (globalThis as { window: unknown }).window = {};
  },
  setupUserRejection: () => {
    const win = (globalThis as { window: any }).window;
    win.hanaWallet.send = vi.fn().mockRejectedValue(new Error('User rejected'));
  },
  setupMalformedXdr: () => {
    const win = (globalThis as { window: any }).window;
    win.hanaWallet.send = vi.fn().mockRejectedValue(new Error('Malformed XDR'));
  },
  setupNetworkMismatch: () => {
    const win = (globalThis as { window: any }).window;
    win.hanaWallet.send = vi.fn().mockRejectedValue(new Error('Network mismatch'));
  },
});
