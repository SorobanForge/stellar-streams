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

import { getAddress, isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';

runAdapterConformanceSuite({
  name: 'FreighterAdapter',
  createAdapter: () => new FreighterAdapter(),
  setupAvailable: () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: true, error: undefined });
    vi.mocked(requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER', error: undefined });
    vi.mocked(getAddress).mockResolvedValue({ address: 'GB_FREIGHTER', error: undefined });
  },
  setupUnavailable: () => {
    vi.mocked(isConnected).mockResolvedValue({ isConnected: false, error: undefined });
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
