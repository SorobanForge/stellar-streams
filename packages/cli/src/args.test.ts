import { describe, it, expect } from 'vitest';
import { parseArgs, extractCommonFlags } from './args';

describe('args', () => {
  describe('parseArgs', () => {
    it('parses basic command structure', () => {
      const result = parseArgs(['streams', 'show', '123']);
      expect(result.command).toBe('streams');
      expect(result.subcommand).toBe('show');
      expect(result.args.arg1).toBe('123');
    });

    it('parses flags with equals sign', () => {
      const result = parseArgs(['streams', 'show', '123', '--network=testnet']);
      expect(result.flags.network).toBe('testnet');
    });

    it('parses flags with space separator', () => {
      const result = parseArgs(['streams', 'show', '123', '--network', 'local']);
      expect(result.flags.network).toBe('local');
    });

    it('parses boolean flags', () => {
      const result = parseArgs(['streams', 'create', 'arg1', 'arg2', '--dry-run']);
      expect(result.flags['dry-run']).toBe(true);
    });

    it('handles short flags', () => {
      const result = parseArgs(['streams', 'show', '123', '-h']);
      expect(result.flags.h).toBe(true);
    });
  });

  describe('extractCommonFlags', () => {
    it('defaults to testnet network', () => {
      const flags = extractCommonFlags({});
      expect(flags.network).toBe('testnet');
      expect(flags.dryRun).toBe(false);
      expect(flags.help).toBe(false);
    });

    it('extracts network flag', () => {
      const flags = extractCommonFlags({ network: 'mainnet' });
      expect(flags.network).toBe('mainnet');
    });

    it('extracts dry-run flag', () => {
      const flags = extractCommonFlags({ 'dry-run': true });
      expect(flags.dryRun).toBe(true);
    });

    it('extracts help flag from both --help and -h', () => {
      expect(extractCommonFlags({ help: true }).help).toBe(true);
      expect(extractCommonFlags({ h: true }).help).toBe(true);
    });

    it('rejects invalid network', () => {
      expect(() => {
        extractCommonFlags({ network: 'invalid' });
      }).toThrow('Invalid --network value');
    });

    it('treats dry-run string true as boolean', () => {
      const flags = extractCommonFlags({ 'dry-run': 'true' });
      expect(flags.dryRun).toBe(true);
    });
  });
});
