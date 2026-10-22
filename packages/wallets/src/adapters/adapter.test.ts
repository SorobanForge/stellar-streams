import { describe, it, expect } from 'vitest';
import {
  TESTNET_PASSPHRASE,
  PUBLIC_NETWORK_PASSPHRASE,
  resolveNetworkPassphrase,
  type WalletAdapter,
  type SignTransactionOptions,
} from './adapter';
import { FreighterAdapter } from './freighter';
import { AlbedoAdapter } from './albedo';
import { RabetAdapter } from './rabe';
import { HanaAdapter } from './hana';

describe('WalletAdapter interface', () => {
  const adapters: WalletAdapter[] = [
    new FreighterAdapter(),
    new AlbedoAdapter(),
    new RabetAdapter(),
    new HanaAdapter(),
  ];

  it('exposes passphrase constants', () => {
    expect(TESTNET_PASSPHRASE).toBe('Test SDF Network ; September 2015');
    expect(PUBLIC_NETWORK_PASSPHRASE).toBe('Public Global Stellar Network ; September 2015');
  });

  it('resolves the network passphrase from options', () => {
    expect(resolveNetworkPassphrase()).toBe(TESTNET_PASSPHRASE);
    expect(resolveNetworkPassphrase({ network: 'TESTNET' })).toBe(TESTNET_PASSPHRASE);
    expect(resolveNetworkPassphrase({ network: 'MAINNET' })).toBe(PUBLIC_NETWORK_PASSPHRASE);
    expect(resolveNetworkPassphrase({ networkPassphrase: 'custom' })).toBe('custom');
  });

  it('every adapter implements connect, getPublicKey, signTransaction, isAvailable', () => {
    for (const adapter of adapters) {
      expect(typeof adapter.connect).toBe('function');
      expect(typeof adapter.getPublicKey).toBe('function');
      expect(typeof adapter.signTransaction).toBe('function');
      expect(typeof adapter.isAvailable).toBe('function');
      expect(typeof adapter.id).toBe('string');
      expect(typeof adapter.name).toBe('string');
    }
  });

  it('exposes disconnect only on adapters whose wallet API supports it', () => {
    const supporting = adapters
      .filter((adapter) => typeof adapter.disconnect === 'function')
      .map((adapter) => adapter.id);
    expect(supporting).toEqual(['rabe']);
  });

  it('exposes signAuthEntry only on adapters whose wallet API supports it', () => {
    const supporting = adapters
      .filter((adapter) => typeof adapter.signAuthEntry === 'function')
      .map((adapter) => adapter.id);
    expect(supporting).toEqual(['freighter']);
  });
});

describe('SignTransactionOptions type', () => {
  it('accepts optional network and networkPassphrase', () => {
    const opts: SignTransactionOptions = { network: 'TESTNET' };
    expect(opts.network).toBe('TESTNET');
  });
});
