import { describe, it, expect } from 'vitest';
import { resolveConfig, getDefaultConfig, ConfigResolutionError } from './config';
import { NETWORKS } from './networks';

describe('resolveConfig', () => {
  describe('default behavior', () => {
    it('should default to testnet when no environment is provided', () => {
      const config = resolveConfig({});
      expect(config.network).toBe('testnet');
      expect(config.rpcUrl).toBe(NETWORKS.testnet.rpcUrl);
      expect(config.horizonUrl).toBe(NETWORKS.testnet.horizonUrl);
      expect(config.passphrase).toBe(NETWORKS.testnet.passphrase);
    });

    it('should use testnet configuration when NEXT_PUBLIC_STELLAR_NETWORK is "testnet"', () => {
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
      });
      expect(config.network).toBe('testnet');
      expect(config.rpcUrl).toBe(NETWORKS.testnet.rpcUrl);
      expect(config.horizonUrl).toBe(NETWORKS.testnet.horizonUrl);
      expect(config.passphrase).toBe(NETWORKS.testnet.passphrase);
    });

    it('should use mainnet configuration when NEXT_PUBLIC_STELLAR_NETWORK is "mainnet"', () => {
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet',
      });
      expect(config.network).toBe('mainnet');
      expect(config.rpcUrl).toBe(NETWORKS.mainnet.rpcUrl);
      expect(config.horizonUrl).toBe(NETWORKS.mainnet.horizonUrl);
      expect(config.passphrase).toBe(NETWORKS.mainnet.passphrase);
    });

    it('should use local configuration when NEXT_PUBLIC_STELLAR_NETWORK is "local"', () => {
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'local',
      });
      expect(config.network).toBe('local');
      expect(config.rpcUrl).toBe(NETWORKS.local.rpcUrl);
      expect(config.horizonUrl).toBe(NETWORKS.local.horizonUrl);
      expect(config.passphrase).toBe(NETWORKS.local.passphrase);
    });
  });

  describe('environment variable overrides', () => {
    it('should allow override of RPC URL', () => {
      const customRpc = 'https://custom-rpc.example.com';
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
        NEXT_PUBLIC_SOROBAN_RPC_URL: customRpc,
      });
      expect(config.rpcUrl).toBe(customRpc);
      expect(config.network).toBe('testnet');
      expect(config.passphrase).toBe(NETWORKS.testnet.passphrase);
    });

    it('should allow override of Horizon URL', () => {
      const customHorizon = 'https://custom-horizon.example.com';
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
        NEXT_PUBLIC_HORIZON_URL: customHorizon,
      });
      expect(config.horizonUrl).toBe(customHorizon);
      expect(config.network).toBe('testnet');
      expect(config.passphrase).toBe(NETWORKS.testnet.passphrase);
    });

    it('should allow both RPC and Horizon URL overrides', () => {
      const customRpc = 'https://custom-rpc.example.com';
      const customHorizon = 'https://custom-horizon.example.com';
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet',
        NEXT_PUBLIC_SOROBAN_RPC_URL: customRpc,
        NEXT_PUBLIC_HORIZON_URL: customHorizon,
      });
      expect(config.rpcUrl).toBe(customRpc);
      expect(config.horizonUrl).toBe(customHorizon);
      expect(config.network).toBe('mainnet');
      expect(config.passphrase).toBe(NETWORKS.mainnet.passphrase);
    });
  });

  describe('passphrase validation', () => {
    it('should accept matching passphrase without error', () => {
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: NETWORKS.testnet.passphrase,
      });
      expect(config.passphrase).toBe(NETWORKS.testnet.passphrase);
    });

    it('should accept mainnet passphrase when network is mainnet', () => {
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet',
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: NETWORKS.mainnet.passphrase,
      });
      expect(config.passphrase).toBe(NETWORKS.mainnet.passphrase);
    });

    it('should reject mismatched passphrase for testnet', () => {
      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
          NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: NETWORKS.mainnet.passphrase,
        }),
      ).toThrow(ConfigResolutionError);

      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
          NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: NETWORKS.mainnet.passphrase,
        }),
      ).toThrow(/passphrase mismatch/i);
    });

    it('should reject mismatched passphrase for mainnet', () => {
      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet',
          NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: NETWORKS.testnet.passphrase,
        }),
      ).toThrow(ConfigResolutionError);

      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet',
          NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: NETWORKS.testnet.passphrase,
        }),
      ).toThrow(/passphrase mismatch/i);
    });

    it('should reject arbitrary passphrase that does not match any network', () => {
      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
          NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: 'Invalid Passphrase ; January 2020',
        }),
      ).toThrow(ConfigResolutionError);

      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
          NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: 'Invalid Passphrase ; January 2020',
        }),
      ).toThrow(/passphrase mismatch/i);
    });

    it('should provide helpful error message with both expected and provided passphrases', () => {
      const invalidPassphrase = 'Bad Passphrase ; January 2020';
      try {
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
          NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: invalidPassphrase,
        });
        expect.fail('Should have thrown ConfigResolutionError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigResolutionError);
        expect((error as ConfigResolutionError).message).toContain(invalidPassphrase);
        expect((error as ConfigResolutionError).message).toContain(NETWORKS.testnet.passphrase);
      }
    });
  });

  describe('error handling', () => {
    it('should throw ConfigResolutionError for invalid network', () => {
      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'invalid-network',
        }),
      ).toThrow(ConfigResolutionError);

      expect(() =>
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'invalid-network',
        }),
      ).toThrow(/invalid network/i);
    });

    it('should include network name in error message for invalid network', () => {
      try {
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'production',
        });
        expect.fail('Should have thrown ConfigResolutionError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigResolutionError);
        expect((error as ConfigResolutionError).message).toContain('production');
      }
    });

    it('should throw ConfigResolutionError with descriptive message', () => {
      try {
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'staging',
        });
        expect.fail('Should have thrown ConfigResolutionError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigResolutionError);
        expect((error as ConfigResolutionError).message).toContain('local, testnet, mainnet');
      }
    });

    it('should have correct error name', () => {
      try {
        resolveConfig({
          NEXT_PUBLIC_STELLAR_NETWORK: 'unknown',
        });
        expect.fail('Should have thrown ConfigResolutionError');
      } catch (error) {
        expect((error as ConfigResolutionError).name).toBe('ConfigResolutionError');
      }
    });
  });

  describe('complex scenarios', () => {
    it('should handle all overrides together', () => {
      const customRpc = 'https://custom-rpc.example.com';
      const customHorizon = 'https://custom-horizon.example.com';
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'local',
        NEXT_PUBLIC_SOROBAN_RPC_URL: customRpc,
        NEXT_PUBLIC_HORIZON_URL: customHorizon,
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: NETWORKS.local.passphrase,
      });
      expect(config).toEqual({
        network: 'local',
        rpcUrl: customRpc,
        horizonUrl: customHorizon,
        passphrase: NETWORKS.local.passphrase,
      });
    });

    it('should preserve defaults when only network is changed', () => {
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet',
      });
      expect(config.rpcUrl).toBe(NETWORKS.mainnet.rpcUrl);
      expect(config.horizonUrl).toBe(NETWORKS.mainnet.horizonUrl);
      expect(config.passphrase).toBe(NETWORKS.mainnet.passphrase);
    });

    it('should allow undefined values in env object without errors', () => {
      const config = resolveConfig({
        NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
        NEXT_PUBLIC_SOROBAN_RPC_URL: undefined,
        NEXT_PUBLIC_HORIZON_URL: undefined,
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: undefined,
      });
      expect(config).toEqual({
        network: 'testnet',
        rpcUrl: NETWORKS.testnet.rpcUrl,
        horizonUrl: NETWORKS.testnet.horizonUrl,
        passphrase: NETWORKS.testnet.passphrase,
      });
    });
  });
});

describe('getDefaultConfig', () => {
  it('should return testnet defaults', () => {
    const config = getDefaultConfig('testnet');
    expect(config).toEqual({
      network: 'testnet',
      rpcUrl: NETWORKS.testnet.rpcUrl,
      horizonUrl: NETWORKS.testnet.horizonUrl,
      passphrase: NETWORKS.testnet.passphrase,
    });
  });

  it('should return mainnet defaults', () => {
    const config = getDefaultConfig('mainnet');
    expect(config).toEqual({
      network: 'mainnet',
      rpcUrl: NETWORKS.mainnet.rpcUrl,
      horizonUrl: NETWORKS.mainnet.horizonUrl,
      passphrase: NETWORKS.mainnet.passphrase,
    });
  });

  it('should return local defaults', () => {
    const config = getDefaultConfig('local');
    expect(config).toEqual({
      network: 'local',
      rpcUrl: NETWORKS.local.rpcUrl,
      horizonUrl: NETWORKS.local.horizonUrl,
      passphrase: NETWORKS.local.passphrase,
    });
  });
});
