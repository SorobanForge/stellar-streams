/* eslint-disable no-console -- stdout/stderr are this executable's user interface. */
import { parseArgs } from 'node:util';
import { Keypair, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  StreamsClient,
  assetContractId,
  type SimulationResult,
  type WriteResult,
} from '@stellar-starter-kit/sdk';
import { resolveContractId, resolveNetwork, resolveSecretKey } from './config.js';
import { assertSchedule, jsonReplacer, parseAmount, parseTimestamp } from './format.js';

const USAGE = `Usage: streams <command> [options]

Commands:
  create --recipient <G...> --amount <base units> --end <time> [options]
  show <stream-id> [options]
  withdraw <stream-id> [options]

Options:
  --network <local|testnet|mainnet>  Network to use (default: testnet)
  --contract-id <C...>               Stream contract id (default: $STREAMS_CONTRACT_ID)
  --secret-key <S...>                Signing key (default: $STREAMS_SECRET_KEY)
  --dry-run                          Simulate and print the transaction without submitting
  -h, --help                         Show this help

create options:
  --recipient <G...>    Recipient address (required)
  --amount <number>     Amount in the token's smallest unit (required)
  --end <time>          End time as unix seconds or ISO 8601 (required)
  --start <time>        Start time (default: now)
  --cliff <time>        Cliff time (default: start)
  --token <C...>        Token contract id (default: the network's native XLM SAC)
  --label <text>        Optional stream label
  --reference <text>    Optional external reference

Examples:
  STREAMS_CONTRACT_ID=C... STREAMS_SECRET_KEY=S... streams create \\
    --recipient G... --amount 10000000 --end 2026-12-31T00:00:00Z
  streams show 1 --network testnet
  streams withdraw 1 --dry-run
`;

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  network: { type: 'string' },
  'contract-id': { type: 'string' },
  'secret-key': { type: 'string' },
  'dry-run': { type: 'boolean' },
  recipient: { type: 'string' },
  amount: { type: 'string' },
  start: { type: 'string' },
  end: { type: 'string' },
  cliff: { type: 'string' },
  token: { type: 'string' },
  label: { type: 'string' },
  reference: { type: 'string' },
} as const;

type CliValues = {
  [K in keyof typeof OPTIONS]?: (typeof OPTIONS)[K] extends { type: 'boolean' } ? boolean : string;
};

/** Runs the CLI and returns a process exit code instead of calling `process.exit`. */
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    console.error(`streams: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Run "streams --help" for usage.');
    return 2;
  }

  const values = parsed.values as unknown as CliValues;
  if (values.help || parsed.positionals.length === 0) {
    console.log(USAGE);
    return 0;
  }

  try {
    const [command, ...args] = parsed.positionals;
    if (command === 'create') return await create(values);
    if (command === 'show') return await show(values, requireStreamId(args));
    if (command === 'withdraw') return await withdraw(values, requireStreamId(args));
    throw new Error(`Unknown command "${command}". Run "streams --help" for usage.`);
  } catch (error) {
    console.error(`streams: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

async function create(values: CliValues): Promise<number> {
  const { client, keypair, networkPassphrase, dryRun } = connect(values);
  const startTime = values.start ? parseTimestamp(values.start) : Math.floor(Date.now() / 1000);
  const endTime = parseTimestamp(requireOption(values.end, '--end'));
  const cliffTime = values.cliff ? parseTimestamp(values.cliff) : startTime;
  assertSchedule(startTime, endTime, cliffTime);

  const recipient = requireOption(values.recipient, '--recipient');
  if (!StrKey.isValidEd25519PublicKey(recipient)) {
    throw new Error(`Invalid recipient "${recipient}": expected a G... account address.`);
  }

  const result = await client.createStream(
    {
      sender: keypair.publicKey(),
      recipient,
      token: values.token ?? assetContractId('native', networkPassphrase),
      amount: parseAmount(requireOption(values.amount, '--amount')),
      startTime,
      endTime,
      cliffTime,
      label: values.label,
      reference: values.reference,
    },
    dryRun ? { simulateOnly: true } : {},
  );
  printWriteResult('create_stream', result, dryRun);
  return 0;
}

async function show(values: CliValues, streamId: string): Promise<number> {
  const { client } = connect(values);
  const stream = await client.getStream(streamId);
  if (stream === null) {
    throw new Error(`Stream ${streamId} was not found on ${client.activeRpcUrl}.`);
  }
  console.log(JSON.stringify(stream, jsonReplacer, 2));
  return 0;
}

async function withdraw(values: CliValues, streamId: string): Promise<number> {
  const { client, dryRun } = connect(values);
  const result = await client.withdraw(streamId, dryRun ? { simulateOnly: true } : {});
  printWriteResult('withdraw', result, dryRun);
  return 0;
}

function connect(values: CliValues): {
  client: StreamsClient;
  keypair: Keypair;
  networkPassphrase: string;
  dryRun: boolean;
} {
  const network = resolveNetwork(values.network ?? 'testnet');
  const keypair = Keypair.fromSecret(resolveSecretKey(values['secret-key']));
  const client = new StreamsClient({
    contractId: resolveContractId(values['contract-id']),
    rpcUrl: network.sorobanRpcUrl,
    networkPassphrase: network.networkPassphrase,
    publicKey: keypair.publicKey(),
    signTransaction: async (xdr, signingOptions) => {
      const transaction = TransactionBuilder.fromXDR(xdr, signingOptions.networkPassphrase);
      transaction.sign(keypair);
      return transaction.toXDR();
    },
  });
  return {
    client,
    keypair,
    networkPassphrase: network.networkPassphrase,
    dryRun: values['dry-run'] === true,
  };
}

function printWriteResult(
  method: string,
  result: WriteResult | SimulationResult,
  dryRun: boolean,
): void {
  if (!dryRun) {
    console.log(`${method} submitted: ${(result as WriteResult).hash}`);
    return;
  }
  const simulation = result as SimulationResult;
  console.log(
    JSON.stringify(
      {
        method,
        transactionXdr: simulation.transaction.toXDR(),
        minResourceFee: simulation.minResourceFee,
        cpuInsns: simulation.cpuInsns,
        memBytes: simulation.memBytes,
        authEntries: simulation.auth.length,
      },
      jsonReplacer,
      2,
    ),
  );
}

function requireOption(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing required option ${flag}.`);
  return value;
}

function requireStreamId(args: string[]): string {
  const [streamId] = args;
  if (!streamId) throw new Error('Missing stream id.');
  if (!/^\d+$/.test(streamId)) {
    throw new Error(`Invalid stream id "${streamId}": expected a non-negative integer.`);
  }
  return streamId;
}
