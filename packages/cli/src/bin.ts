#!/usr/bin/env node
/* eslint-disable no-console */

import { loadEnv } from './env.js';
import { parseArgs, extractCommonFlags } from './args.js';
import { streamsCreate, streamsShow, streamsWithdraw } from './commands.js';

const HELP_TEXT = `
stellar-streams CLI - Manage Stellar payment streams

USAGE:
  stellar-streams <command> [arguments] [flags]

COMMANDS:
  streams create <recipient> <token> <amount> <startTime> <endTime> <cliffTime>
    Create a new payment stream
    
  streams show <streamId>
    Display details of a stream
    
  streams withdraw <streamId>
    Withdraw vested tokens from a stream

FLAGS:
  --network <name>    Network to use: local, testnet (default), or mainnet
  --dry-run           Build transaction but don't submit it
  --help, -h          Show this help message

ENVIRONMENT VARIABLES:
  STELLAR_STREAMS_SECRET_KEY   Stellar secret key (starts with 'S')
  STELLAR_STREAMS_CONTRACT_ID  Contract ID of the streams contract
  STELLAR_STREAMS_NETWORK      Network to use (local, testnet, mainnet)

EXAMPLES:
  stellar-streams streams show 123
  stellar-streams streams create GBXYZ... CTOKEN... 1000000 1699000000 1710000000 1705000000 --network testnet
  stellar-streams streams withdraw 123 --dry-run --network local

For more information, visit: https://github.com/SorobanForge/stellar-streams
`;

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);

    // Handle help flag globally
    if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    // Parse arguments
    const parsed = parseArgs(argv);

    // Load environment
    const env = loadEnv();

    // Extract common flags
    const flags = extractCommonFlags(parsed.flags);

    if (flags.help) {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    const ctx = {
      secretKey: env.secretKey,
      contractId: env.contractId,
      network: flags.network,
      dryRun: flags.dryRun,
    };

    // Route commands
    if (parsed.command === 'streams') {
      if (parsed.subcommand === 'create') {
        const [recipient, token, amount, startTime, endTime, cliffTime] = [
          parsed.args.arg1,
          parsed.args.arg2,
          parsed.args.arg3,
          parsed.args.arg4,
          parsed.args.arg5,
          parsed.args.arg6,
        ];

        if (
          !recipient ||
          !token ||
          !amount ||
          !startTime ||
          !endTime ||
          !cliffTime
        ) {
          console.error(
            'Error: streams create requires: recipient, token, amount, startTime, endTime, cliffTime',
          );
          process.exit(1);
        }

        await streamsCreate(ctx, recipient, token, amount, startTime, endTime, cliffTime);
      } else if (parsed.subcommand === 'show') {
        const streamId = parsed.args.arg1;
        if (!streamId) {
          console.error('Error: streams show requires a stream ID argument');
          process.exit(1);
        }
        await streamsShow(ctx, streamId);
      } else if (parsed.subcommand === 'withdraw') {
        const streamId = parsed.args.arg1;
        if (!streamId) {
          console.error('Error: streams withdraw requires a stream ID argument');
          process.exit(1);
        }
        await streamsWithdraw(ctx, streamId);
      } else {
        console.error(`Unknown subcommand: ${parsed.subcommand}`);
        console.log(HELP_TEXT);
        process.exit(1);
      }
    } else {
      console.error(`Unknown command: ${parsed.command}`);
      console.log(HELP_TEXT);
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ Error: ${message}\n`);
    process.exit(1);
  }
}

main();
