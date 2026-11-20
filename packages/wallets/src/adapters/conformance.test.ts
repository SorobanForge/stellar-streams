import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WalletAdapter } from './adapter';

export interface ConformanceAdapterFactory {
  name: string;
  createAdapter: () => WalletAdapter;
  setupAvailable: () => void;
  setupUnavailable: () => void;
  setupUserRejection: () => void;
  setupMalformedXdr: () => void;
  setupNetworkMismatch: () => void;
  setupDisconnect?: () => { disconnectSpy?: ReturnType<typeof vi.fn> };
}

export function runAdapterConformanceSuite(factory: ConformanceAdapterFactory) {
  describe(`WalletAdapter Conformance: ${factory.name}`, () => {
    let adapter: WalletAdapter;

    beforeEach(() => {
      vi.clearAllMocks();
      adapter = factory.createAdapter();
    });

    describe('availability', () => {
      it('reports available when extension/device is present', async () => {
        factory.setupAvailable();
        expect(await adapter.isAvailable()).toBe(true);
      });

      it('reports unavailable when extension/device is absent', async () => {
        factory.setupUnavailable();
        expect(await adapter.isAvailable()).toBe(false);
      });
    });

    describe('connect and public key', () => {
      it('connects successfully and returns public key', async () => {
        factory.setupAvailable();
        const pk = await adapter.connect();
        expect(typeof pk).toBe('string');
        expect(pk.length).toBeGreaterThan(0);
        await expect(adapter.getPublicKey()).resolves.toBe(pk);
      });

      it('throws when connecting while unavailable', async () => {
        factory.setupUnavailable();
        await expect(adapter.connect()).rejects.toThrow();
      });
    });

    describe('user rejection', () => {
      it('handles user rejection or cancellation during signing', async () => {
        factory.setupAvailable();
        await adapter.connect().catch(() => {});
        factory.setupUserRejection();

        const promise = adapter.signTransaction('AAAA...');
        await expect(promise).rejects.toThrow();
      });
    });

    describe('malformed XDR', () => {
      it('rejects malformed XDR transactions', async () => {
        factory.setupAvailable();
        await adapter.connect().catch(() => {});
        factory.setupMalformedXdr();

        await expect(adapter.signTransaction('MALFORMED')).rejects.toThrow();
      });
    });

    describe('network mismatch', () => {
      it('handles network mismatch configurations cleanly', async () => {
        factory.setupAvailable();
        await adapter.connect().catch(() => {});
        factory.setupNetworkMismatch();

        await expect(adapter.signTransaction('AAAA...', { network: 'MAINNET' })).rejects.toThrow();
      });
    });

    if (factory.setupDisconnect) {
      describe('disconnect', () => {
        it('supports session/device disconnect', async () => {
          factory.setupAvailable();
          await adapter.connect();
          const config = factory.setupDisconnect!();
          if (adapter.disconnect) {
            await adapter.disconnect();
            if (config?.disconnectSpy) {
              expect(config.disconnectSpy).toHaveBeenCalled();
            }
          }
        });
      });
    }
  });
}
