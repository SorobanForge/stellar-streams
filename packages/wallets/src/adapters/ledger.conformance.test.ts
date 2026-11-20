import { vi } from 'vitest';
import { LedgerAdapter } from './ledger';
import { runAdapterConformanceSuite } from './conformance.test';

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
    vi.stubGlobal('navigator', {
      hid: {
        requestDevice: vi.fn().mockResolvedValue([]),
        getDevices: vi.fn().mockResolvedValue([]),
      },
    });
  },
  setupUserRejection: () => {
    vi.stubGlobal('navigator', {
      hid: {
        requestDevice: vi.fn().mockRejectedValue(new Error('User rejected')) ,
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
