import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv, isValidSecretKey, maskSecretKey } from './env';
import { Keypair } from '@stellar/stellar-sdk';

describe('env', () => {
  const testKeypair = Keypair.random();
  const testSecretKey = testKeypair.secret();

  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env['STELLAR_STREAMS_SECRET_KEY'];
    delete process.env['STELLAR_STREAMS_CONTRACT_ID'];
    delete process.env['STELLAR_STREAMS_NETWORK'];
  });

  afterEach(() => {
    // Clean up after each test
    delete process.env['STELLAR_STREAMS_SECRET_KEY'];
    delete process.env['STELLAR_STREAMS_CONTRACT_ID'];
    delete process.env['STELLAR_STREAMS_NETWORK'];
  });

  describe('loadEnv', () => {
    it('loads all required environment variables', () => {
      process.env['STELLAR_STREAMS_SECRET_KEY'] = testSecretKey;
      process.env['STELLAR_STREAMS_CONTRACT_ID'] = 'CTEST123';
      process.env['STELLAR_STREAMS_NETWORK'] = 'testnet';

      const env = loadEnv();
      expect(env.secretKey).toBe(testSecretKey);
      expect(env.contractId).toBe('CTEST123');
      expect(env.network).toBe('testnet');
    });

    it('defaults network to testnet', () => {
      process.env['STELLAR_STREAMS_SECRET_KEY'] = testSecretKey;
      process.env['STELLAR_STREAMS_CONTRACT_ID'] = 'CTEST123';

      const env = loadEnv();
      expect(env.network).toBe('testnet');
    });

    it('throws when secret key is missing', () => {
      process.env['STELLAR_STREAMS_CONTRACT_ID'] = 'CTEST123';

      expect(() => {
        loadEnv();
      }).toThrow('STELLAR_STREAMS_SECRET_KEY');
    });

    it('throws when contract ID is missing', () => {
      process.env['STELLAR_STREAMS_SECRET_KEY'] = testSecretKey;

      expect(() => {
        loadEnv();
      }).toThrow('STELLAR_STREAMS_CONTRACT_ID');
    });

    it('throws on invalid network', () => {
      process.env['STELLAR_STREAMS_SECRET_KEY'] = testSecretKey;
      process.env['STELLAR_STREAMS_CONTRACT_ID'] = 'CTEST123';
      process.env['STELLAR_STREAMS_NETWORK'] = 'invalidnet';

      expect(() => {
        loadEnv();
      }).toThrow('Invalid STELLAR_STREAMS_NETWORK value');
    });

    it('accepts all valid network values', () => {
      process.env['STELLAR_STREAMS_SECRET_KEY'] = testSecretKey;
      process.env['STELLAR_STREAMS_CONTRACT_ID'] = 'CTEST123';

      for (const network of ['local', 'testnet', 'mainnet']) {
        process.env['STELLAR_STREAMS_NETWORK'] = network;
        const env = loadEnv();
        expect(env.network).toBe(network);
      }
    });
  });

  describe('isValidSecretKey', () => {
    it('validates real Stellar secret keys', () => {
      expect(isValidSecretKey(testSecretKey)).toBe(true);
    });

    it('rejects non-S prefix', () => {
      expect(isValidSecretKey('GBAD0000000000000000000000000000000000000000000000000000000')).toBe(
        false,
      );
    });

    it('rejects wrong length', () => {
      expect(isValidSecretKey('S' + testSecretKey.slice(1, 20))).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(isValidSecretKey('S' + '0'.repeat(55))).toBe(false);
    });
  });

  describe('maskSecretKey', () => {
    it('masks secret key preserving format', () => {
      const masked = maskSecretKey(testSecretKey);
      expect(masked).toMatch(/^.{4}\.\.\..{4}$/);
      expect(masked).not.toContain(testSecretKey.slice(4, -4));
    });

    it('returns **** for very short keys', () => {
      expect(maskSecretKey('SHORT')).toBe('****');
    });

    it('never leaks full secret key', () => {
      const masked = maskSecretKey(testSecretKey);
      // Check that the middle part is not exposed
      expect(masked.includes(testSecretKey.slice(10, 40))).toBe(false);
    });
  });
});
