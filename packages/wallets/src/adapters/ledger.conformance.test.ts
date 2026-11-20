import { vi } from 'vitest';
import { LedgerAdapter } from './ledger';
import { runAdapterConformanceSuite } from './conformance.test';

runAdapterConformanceSuite({
  name: 'LedgerAdapter',
  createAdapter: () => new LedgerAdapter(),
  setupAvailable: () => {
    // Ledger WebHID or mock setup
  },
  setupUnavailable: () => {
    // Simulate WebHID absence
  },
  setupUserRejection: () => {
    // User rejection on device
  },
  setupMalformedXdr: () => {
    // Malformed XDR rejection
  },
  setupNetworkMismatch: () => {
    // Network mismatch rejection
  },
  setupDisconnect: () => {
    return { disconnectSpy: vi.fn() };
  },
});
