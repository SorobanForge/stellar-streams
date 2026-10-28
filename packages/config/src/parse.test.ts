import { describe, it, expect } from 'vitest';
import { parseEnvironment, ENV_VARS, DEFAULTS } from './parse.js';
import { KNOWN_NETWORKS } from './networks.js';

describe('parseEnvironment', () => {
  describe('Valid environments', () => {
    it('should parse a complete valid testnet environment', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'testnet',
        [ENV_VARS.HORIZON_URL]: KNOWN_NETWORKS.testnet.horizonUrl,
        [ENV_VARS.SOROBAN_RPC_URL]: KNOWN_NETWORKS.testnet.sorobanRpcUrl,
        [ENV_VARS.NETWORK_PASSPHRASE]: KNOWN_NETWORKS.testnet.networkPassphrase,
        [ENV_VARS.EXPERT_URL]: KNOWN_NETWORKS.testnet.expertUrl,
        [ENV_VARS.STREAM_CONTRACT_ID]: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        [ENV_VARS.SPLITS_CONTRACT_ID]: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB7XZ',
        [ENV_VARS.ESCROW_CONTRACT_ID]: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCGKC',
        [ENV_VARS.TOKEN_CONTRACT_ID]: DEFAULTS.TOKEN_CONTRACT_ID,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.errors).toHaveLength(0);
      expect(result.config).toEqual({
        network: 'testnet',
        horizonUrl: KNOWN_NETWORKS.testnet.horizonUrl,
        sorobanRpcUrl: KNOWN_NETWORKS.testnet.sorobanRpcUrl,
        networkPassphrase: KNOWN_NETWORKS.testnet.networkPassphrase,
        expertUrl: KNOWN_NETWORKS.testnet.expertUrl,
        streamContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        splitsContractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB7XZ',
        escrowContractId: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCGKC',
        tokenContractId: DEFAULTS.TOKEN_CONTRACT_ID,
      });
    });

    it('should parse a minimal environment with defaults', () => {
      const env = {};

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.errors).toHaveLength(0);
      expect(result.config).toEqual({
        network: 'testnet',
        horizonUrl: KNOWN_NETWORKS.testnet.horizonUrl,
        sorobanRpcUrl: KNOWN_NETWORKS.testnet.sorobanRpcUrl,
        networkPassphrase: KNOWN_NETWORKS.testnet.networkPassphrase,
        expertUrl: KNOWN_NETWORKS.testnet.expertUrl,
        streamContractId: undefined,
        splitsContractId: undefined,
        escrowContractId: undefined,
        tokenContractId: DEFAULTS.TOKEN_CONTRACT_ID,
      });
    });

    it('should allow undefined contract IDs', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'testnet',
        [ENV_VARS.STREAM_CONTRACT_ID]: '',
        [ENV_VARS.SPLITS_CONTRACT_ID]: '',
        [ENV_VARS.ESCROW_CONTRACT_ID]: '',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.config?.streamContractId).toBeUndefined();
      expect(result.config?.splitsContractId).toBeUndefined();
      expect(result.config?.escrowContractId).toBeUndefined();
    });

    it('should parse mainnet configuration', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'mainnet',
        [ENV_VARS.HORIZON_URL]: KNOWN_NETWORKS.mainnet.horizonUrl,
        [ENV_VARS.SOROBAN_RPC_URL]: KNOWN_NETWORKS.mainnet.sorobanRpcUrl,
        [ENV_VARS.NETWORK_PASSPHRASE]: KNOWN_NETWORKS.mainnet.networkPassphrase,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.config?.network).toBe('mainnet');
    });

    it('should parse local development configuration', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'local',
        [ENV_VARS.HORIZON_URL]: KNOWN_NETWORKS.local.horizonUrl,
        [ENV_VARS.SOROBAN_RPC_URL]: KNOWN_NETWORKS.local.sorobanRpcUrl,
        [ENV_VARS.NETWORK_PASSPHRASE]: KNOWN_NETWORKS.local.networkPassphrase,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.config?.network).toBe('local');
    });
  });

  describe('Missing required values', () => {
    it('should report a single missing required value', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'mainnet',
        [ENV_VARS.HORIZON_URL]: 'https://wrong-horizon-url.example.com',
        [ENV_VARS.SOROBAN_RPC_URL]: KNOWN_NETWORKS.mainnet.sorobanRpcUrl,
        [ENV_VARS.NETWORK_PASSPHRASE]: KNOWN_NETWORKS.mainnet.networkPassphrase,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe(ENV_VARS.HORIZON_URL);
      expect(result.errors[0].message).toContain('does not match any known');
    });

    it('should report an invalid network value', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'invalid-network',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.NETWORK)).toBe(true);
      expect(result.errors[0].message).toContain('local, testnet, mainnet');
    });
  });

  describe('Contradictory configurations', () => {
    it('should detect contradiction: Testnet passphrase with Mainnet RPC', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'mainnet',
        [ENV_VARS.SOROBAN_RPC_URL]: KNOWN_NETWORKS.mainnet.sorobanRpcUrl,
        [ENV_VARS.NETWORK_PASSPHRASE]: KNOWN_NETWORKS.testnet.networkPassphrase,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.NETWORK_PASSPHRASE)).toBe(true);
      const error = result.errors.find((e) => e.field === ENV_VARS.NETWORK_PASSPHRASE);
      expect(error?.message).toContain('mismatch');
      expect(error?.message).toContain('testnet');
      expect(error?.message).toContain('mainnet');
    });

    it('should detect contradiction: Mainnet passphrase with Testnet network', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'testnet',
        [ENV_VARS.NETWORK_PASSPHRASE]: KNOWN_NETWORKS.mainnet.networkPassphrase,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.NETWORK_PASSPHRASE)).toBe(true);
    });

    it('should detect contradiction: Testnet RPC with Mainnet network', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'mainnet',
        [ENV_VARS.SOROBAN_RPC_URL]: KNOWN_NETWORKS.testnet.sorobanRpcUrl,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.SOROBAN_RPC_URL)).toBe(true);
      const error = result.errors.find((e) => e.field === ENV_VARS.SOROBAN_RPC_URL);
      expect(error?.message).toContain('mismatch');
    });

    it('should detect contradiction: Testnet Horizon with Mainnet network', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'mainnet',
        [ENV_VARS.HORIZON_URL]: KNOWN_NETWORKS.testnet.horizonUrl,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.HORIZON_URL)).toBe(true);
    });

    it('should report all contradictions at once', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'mainnet',
        [ENV_VARS.HORIZON_URL]: KNOWN_NETWORKS.testnet.horizonUrl,
        [ENV_VARS.SOROBAN_RPC_URL]: KNOWN_NETWORKS.testnet.sorobanRpcUrl,
        [ENV_VARS.NETWORK_PASSPHRASE]: KNOWN_NETWORKS.testnet.networkPassphrase,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.field === ENV_VARS.HORIZON_URL)).toBe(true);
      expect(result.errors.some((e) => e.field === ENV_VARS.SOROBAN_RPC_URL)).toBe(true);
      expect(result.errors.some((e) => e.field === ENV_VARS.NETWORK_PASSPHRASE)).toBe(true);
    });

    it('should report multiple contract ID validation errors at once', () => {
      const env = {
        [ENV_VARS.STREAM_CONTRACT_ID]: 'invalid-contract-id',
        [ENV_VARS.SPLITS_CONTRACT_ID]: 'another-invalid-id',
        [ENV_VARS.TOKEN_CONTRACT_ID]: 'token-invalid',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.field === ENV_VARS.STREAM_CONTRACT_ID)).toBe(true);
      expect(result.errors.some((e) => e.field === ENV_VARS.SPLITS_CONTRACT_ID)).toBe(true);
      expect(result.errors.some((e) => e.field === ENV_VARS.TOKEN_CONTRACT_ID)).toBe(true);
    });
  });

  describe('Invalid contract IDs', () => {
    it('should reject invalid stream contract ID', () => {
      const env = {
        [ENV_VARS.STREAM_CONTRACT_ID]: 'not-a-valid-contract-id',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.STREAM_CONTRACT_ID)).toBe(true);
    });

    it('should reject invalid token contract ID', () => {
      const env = {
        [ENV_VARS.TOKEN_CONTRACT_ID]: 'INVALID',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.TOKEN_CONTRACT_ID)).toBe(true);
    });

    it('should accept valid contract IDs', () => {
      const env = {
        [ENV_VARS.STREAM_CONTRACT_ID]: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        [ENV_VARS.SPLITS_CONTRACT_ID]: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB7XZ',
        [ENV_VARS.ESCROW_CONTRACT_ID]: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCGKC',
        [ENV_VARS.TOKEN_CONTRACT_ID]: DEFAULTS.TOKEN_CONTRACT_ID,
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Unknown network passphrase', () => {
    it('should reject unknown network passphrase', () => {
      const env = {
        [ENV_VARS.NETWORK_PASSPHRASE]: 'Unknown Network ; Unknown 0000',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === ENV_VARS.NETWORK_PASSPHRASE)).toBe(true);
      const error = result.errors.find((e) => e.field === ENV_VARS.NETWORK_PASSPHRASE);
      expect(error?.message).toContain('not a recognized Stellar network');
    });
  });

  describe('Expert URL validation', () => {
    it('should warn about mismatched Expert URL', () => {
      const env = {
        [ENV_VARS.NETWORK]: 'testnet',
        [ENV_VARS.EXPERT_URL]: 'https://wrong-url.example.com',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.errors.some((e) => e.field === ENV_VARS.EXPERT_URL)).toBe(true);
      const warning = result.errors.find((e) => e.field === ENV_VARS.EXPERT_URL);
      expect(warning?.severity).toBe('warning');
    });
  });

  describe('Whitespace handling', () => {
    it('should trim whitespace from environment values', () => {
      const env = {
        [ENV_VARS.NETWORK]: '  testnet  ',
        [ENV_VARS.STREAM_CONTRACT_ID]:
          '  CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF  ',
      };

      const result = parseEnvironment(env);

      expect(result.success).toBe(true);
      expect(result.config?.network).toBe('testnet');
      expect(result.config?.streamContractId).toBe(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      );
    });
  });
});
