import type { StellarNetwork } from '@stellar-starter-kit/types';

export interface ParsedArgs {
  command: string;
  subcommand?: string;
  args: Record<string, string>;
  flags: Record<string, boolean | string>;
}

/**
 * Simple CLI argument parser for streams commands.
 * Supports: streams <create|show|withdraw> [args] [--flag value]
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args: Record<string, string> = {};
  const flags: Record<string, boolean | string> = {};

  let command = '';
  let subcommand = '';
  let positionalIndex = 0;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        flags[key] = value;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      // Single-letter flags like -h
      const key = arg.slice(1);
      flags[key] = true;
    } else {
      // Positional arguments
      if (positionalIndex === 0) {
        command = arg;
      } else if (positionalIndex === 1) {
        subcommand = arg;
      } else {
        args[`arg${positionalIndex - 1}`] = arg;
      }
      positionalIndex++;
    }
  }

  return { command, subcommand, args, flags };
}

/**
 * Extracts and validates common flags.
 */
export interface CommonFlags {
  network: StellarNetwork;
  dryRun: boolean;
  help: boolean;
}

export function extractCommonFlags(flags: Record<string, boolean | string>): CommonFlags {
  const networkValue = flags.network as string | undefined;
  const network = (networkValue || 'testnet') as StellarNetwork;

  // Validate network
  const validNetworks: StellarNetwork[] = ['local', 'testnet', 'mainnet'];
  if (!validNetworks.includes(network)) {
    throw new Error(
      `Invalid --network value: "${network}". Must be one of: ${validNetworks.join(', ')}.`,
    );
  }

  const dryRunValue = flags['dry-run'];
  const dryRun = dryRunValue === true || dryRunValue === 'true';

  return {
    network,
    dryRun,
    help: flags.help === true || flags.h === true,
  };
}
