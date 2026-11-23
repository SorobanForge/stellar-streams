import { vi } from 'vitest';
import { HanaAdapter } from './hana';
import { runAdapterConformanceSuite } from './conformance.test';

runAdapterConformanceSuite({
  name: 'HanaAdapter',
  createAdapter: () => new HanaAdapter(),
  setupAvailable: () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      hanaWallet: {
        send: vi.fn().mockResolvedValue({ publicKey: 'GB_HANA' }),
      },
    };
  },
  setupUnavailable: () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
  },
  setupUserRejection: () => {
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window;
    const wallet = win.hanaWallet as Record<string, unknown> | undefined;
    if (wallet) {
      wallet.send = vi.fn().mockRejectedValue(new Error('User rejected'));
    }
  },
  setupMalformedXdr: () => {
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window;
    const wallet = win.hanaWallet as Record<string, unknown> | undefined;
    if (wallet) {
      wallet.send = vi.fn().mockRejectedValue(new Error('Malformed XDR'));
    }
  },
  setupNetworkMismatch: () => {
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window;
    const wallet = win.hanaWallet as Record<string, unknown> | undefined;
    if (wallet) {
      wallet.send = vi.fn().mockRejectedValue(new Error('Network mismatch'));
    }
  },
});
