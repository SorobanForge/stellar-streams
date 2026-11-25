import { describe, it, expect } from 'vitest';
import { WALLET_PROVIDERS } from './index';

describe('Stellar Wallet Providers', () => {
  it('should export all required wallet providers', () => {
    expect(WALLET_PROVIDERS.FREIGHTER).toBe('freighter');
    expect(WALLET_PROVIDERS.ALBEDO).toBe('albedo');
    expect(WALLET_PROVIDERS.RABE).toBe('rabe');
    expect(WALLET_PROVIDERS.HANA).toBe('hana');
    expect(WALLET_PROVIDERS.LEDGER).toBe('ledger');
  });
});
