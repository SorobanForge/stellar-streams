import { describe, it, expect } from 'vitest';
import { WALLET_PROVIDERS, WALLET_PROVIDER_OPTIONS } from './index';

describe('Stellar Wallet Providers', () => {
  it('should export all required wallet providers', () => {
    expect(WALLET_PROVIDERS.FREIGHTER).toBe('freighter');
    expect(WALLET_PROVIDERS.XBULL).toBe('xbull');
    expect(WALLET_PROVIDERS.ALBEDO).toBe('albedo');
    expect(WALLET_PROVIDERS.RABE).toBe('rabe');
    expect(WALLET_PROVIDERS.HANA).toBe('hana');
    expect(WALLET_PROVIDERS.LEDGER).toBe('ledger');
  });

  it('should list every supported provider in the wallet picker options', () => {
    const ids = WALLET_PROVIDER_OPTIONS.map((option) => option.id);

    // The dashboard renders this list, so a provider missing here is a wallet
    // users cannot select even though `connect()` supports it.
    expect(ids).toEqual(['freighter', 'xbull', 'albedo', 'rabe', 'hana']);
    for (const provider of Object.values(WALLET_PROVIDERS)) {
      expect(ids).toContain(provider);
    }
    expect(WALLET_PROVIDER_OPTIONS.find((option) => option.id === 'xbull')?.label).toBe('xBull');
  });
});
