import { vi } from 'vitest';
import { LedgerAdapter } from './ledger';
import { runAdapterConformanceSuite } from './conformance.test';

const ledgerTransport = vi.hoisted(() => ({
  close: vi.fn().mockResolvedValue(undefined),
}));

const ledgerApp = vi.hoisted(() => ({
  getPublicKey: vi.fn().mockResolvedValue({ rawPublicKey: new Uint8Array(32) }),
  signTransaction: vi.fn().mockResolvedValue({ signature: new Uint8Array(64) }),
}));

vi.mock('@ledgerhq/hw-transport-webhid', () => ({
  default: { create: vi.fn().mockResolvedValue(ledgerTransport) },
}));

vi.mock('@ledgerhq/hw-app-str', () => ({
  default: class {
    constructor(_t: unknown) {}
    getPublicKey = ledgerApp.getPublicKey;
    signTransaction = ledgerApp.signTransaction;
  },
}));

runAdapterConformanceSuite({
  name: 'LedgerAdapter',
  createAdapter: () => new LedgerAdapter(),
  setupAvailable: () => {
    vi.stubGlobal('navigator', {
      hid: {
        requestDevice: vi.fn().mockResolvedValue([{}]),
        getDevices: vi.fn().mockResolvedValue([{}]),
      },
    });
  },
  setupUnavailable: () => {
    vi.stubGlobal('navigator', {});
  },
  setupUserRejection: () => {
    vi.stubGlobal('navigator', {
      hid: {
        requestDevice: vi.fn().mockRejectedValue(new Error('User rejected')),
        getDevices: vi.fn().mockResolvedValue([{}]),
      },
    });
  },
  setupMalformedXdr: () => {},
  setupNetworkMismatch: () => {},
  setupDisconnect: () => {
    return { disconnectSpy: vi.fn() };
  },
});
