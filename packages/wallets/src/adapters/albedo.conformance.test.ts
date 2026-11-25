import { vi } from 'vitest';
import albedo from '@albedo-link/intent';
import { AlbedoAdapter } from './albedo';
import { runAdapterConformanceSuite } from './conformance.test';

vi.mock('@albedo-link/intent', () => ({
  default: {
    publicKey: vi.fn(),
    tx: vi.fn(),
  },
}));

runAdapterConformanceSuite({
  name: 'AlbedoAdapter',
  createAdapter: () => new AlbedoAdapter(),
  setupAvailable: () => {
    if (typeof albedo.publicKey !== 'function') {
      (albedo as { publicKey: unknown }).publicKey = vi.fn();
    }
    vi.mocked(albedo.publicKey).mockResolvedValue({
      pubkey: 'GB_ALBEDO',
      signature: '',
      signed_message: '',
    });
  },
  setupUnavailable: () => {
    (albedo as { publicKey?: unknown }).publicKey = undefined;
  },
  setupUserRejection: () => {
    vi.mocked(albedo.tx).mockRejectedValue(new Error('User rejected'));
  },
  setupMalformedXdr: () => {
    vi.mocked(albedo.tx).mockRejectedValue(new Error('Malformed XDR'));
  },
  setupNetworkMismatch: () => {
    vi.mocked(albedo.tx).mockRejectedValue(new Error('Network mismatch'));
  },
});
