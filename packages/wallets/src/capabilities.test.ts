import { describe, it, expect } from 'vitest';
import { WALLET_CAPABILITIES, getWalletCapabilities } from './capabilities';
import { WALLET_PROVIDERS } from './index';
import { WatchAdapter } from './adapters/watch';
import { FreighterAdapter } from './adapters/freighter';
import { AlbedoAdapter } from './adapters/albedo';
import { RabetAdapter } from './adapters/rabe';
import { HanaAdapter } from './adapters/hana';
import { LedgerAdapter } from './adapters/ledger';
import type { WalletAdapter } from './adapters/adapter';

const adapters: Record<string, WalletAdapter> = {
  watch: new WatchAdapter(),
  freighter: new FreighterAdapter(),
  albedo: new AlbedoAdapter(),
  rabe: new RabetAdapter(),
  hana: new HanaAdapter(),
  ledger: new LedgerAdapter(),
};

describe('WALLET_CAPABILITIES', () => {
  it('covers every supported provider exactly once', () => {
    expect(Object.keys(WALLET_CAPABILITIES).sort()).toEqual(Object.values(WALLET_PROVIDERS).sort());
  });

  it('names each wallet the same way its adapter does', () => {
    for (const adapter of Object.values(adapters)) {
      expect(WALLET_CAPABILITIES[adapter.id]).toMatchObject({
        wallet: adapter.id,
        name: adapter.name,
      });
    }
  });

  it('reports signAuthEntry exactly where the adapter implements it', () => {
    for (const adapter of Object.values(adapters)) {
      const caps = WALLET_CAPABILITIES[adapter.id];
      // A read-only adapter exposes a rejecting method but cannot actually sign.
      expect(caps.signAuthEntry).toBe(
        typeof adapter.signAuthEntry === 'function' && !caps.readOnly,
      );
    }
  });

  it('marks only the Ledger adapter as hardware', () => {
    for (const adapter of Object.values(adapters)) {
      expect(WALLET_CAPABILITIES[adapter.id].hardware).toBe(adapter instanceof LedgerAdapter);
    }
  });

  it('marks only Albedo as a deep-link wallet', () => {
    const deepLink = Object.values(WALLET_CAPABILITIES)
      .filter((caps) => caps.deepLink)
      .map((caps) => caps.wallet);
    expect(deepLink).toEqual(['albedo']);
  });

  it('marks only the watch adapter as read-only', () => {
    for (const adapter of Object.values(adapters)) {
      expect(WALLET_CAPABILITIES[adapter.id].readOnly).toBe(adapter instanceof WatchAdapter);
    }
  });
});

describe('getWalletCapabilities', () => {
  it('returns the active wallet capabilities', () => {
    expect(getWalletCapabilities('freighter')?.signAuthEntry).toBe(true);
  });

  it('returns null when no wallet is active', () => {
    expect(getWalletCapabilities(null)).toBeNull();
  });
});
