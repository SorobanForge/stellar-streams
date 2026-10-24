import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { createSigner, getPublicKeyFromSecret } from './signer';
import { isValidSecretKey, maskSecretKey } from './env';

describe('signer', () => {
  // Use a test keypair (deterministic from a specific seed)
  const testKeypair = Keypair.random();
  const testSecretKey = testKeypair.secret();
  const testPublicKey = testKeypair.publicKey();

  describe('getPublicKeyFromSecret', () => {
    it('derives public key from valid secret key', () => {
      const publicKey = getPublicKeyFromSecret(testSecretKey);
      expect(publicKey).toBe(testPublicKey);
    });

    it('throws on invalid secret key format', () => {
      expect(() => {
        getPublicKeyFromSecret('invalid');
      }).toThrow('Invalid secret key format');
    });
  });

  describe('createSigner', () => {
    it('creates a signer function from valid secret key', async () => {
      const signer = createSigner(testSecretKey);
      expect(typeof signer).toBe('function');
    });

    it('throws on invalid secret key format', () => {
      expect(() => {
        createSigner('not-a-secret-key');
      }).toThrow('Invalid secret key format');
    });

    it('throws on invalid secret key', () => {
      expect(() => {
        createSigner('SBAD0000000000000000000000000000000000000000000000000000000');
      }).toThrow();
    });
  });

  describe('isValidSecretKey', () => {
    it('recognizes valid secret keys', () => {
      expect(isValidSecretKey(testSecretKey)).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidSecretKey('not-secret')).toBe(false);
      expect(isValidSecretKey('SBAD')).toBe(false);
      expect(isValidSecretKey('')).toBe(false);
    });

    it('requires S prefix', () => {
      const almostValid = 'T' + testSecretKey.slice(1);
      expect(isValidSecretKey(almostValid)).toBe(false);
    });
  });

  describe('maskSecretKey', () => {
    it('masks secret key for safe logging', () => {
      const masked = maskSecretKey(testSecretKey);
      expect(masked).toContain('...');
      expect(masked).not.toContain(testSecretKey);
      expect(masked.length).toBeLessThan(testSecretKey.length);
    });

    it('handles short keys', () => {
      const short = 'ABC';
      const masked = maskSecretKey(short);
      expect(masked).toBe('****');
    });
  });
});
