import { vi } from 'vitest';
import { FreighterAdapter } from './freighter';
import { runAdapterConformanceSuite } from './conformance.test';

vi.mock('@stellar/freighter-api', () => {
  const isConnected = vi.fn();
  const getAddress = vi.fn();
  const requestAccess = vi.fn();
  const signTransaction = vi.fn();
  const api = { isConnected, getAddress, requestAccess, signTransaction };
  return { ...api, default: api };
});

import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';

runAdapterConformanceSuite({
  name: 'FreighterAdapter',
  createAdapter: () => new FreighterAdapter(),
  setupAvailable: () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true } as unknown as Parameters<typeof isConnected>[0] extends never ? any : any);
    vi.mocked(requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' } as unknown as Parameters<typeof requestAccess>[0] extends never ? any : any);
  },
  setupUnavailable: () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: false } as unknown as Parameters<typeof isConnected>[0] extends never ? any : any);
  },
  setupUserRejection: () => {
    vi.mocked(signTransaction).mockRejectedValue(new Error('User rejected'));
  },
  setupMalformedXdr: () => {
    vi.mocked(signTransaction).mockRejectedValue(new Error('Malformed XDR'));
  },
  setupNetworkMismatch: () => {
    vi.mocked(signTransaction).mockRejectedValue(new Error('Network mismatch'));
  },
});
