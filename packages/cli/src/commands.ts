/* eslint-disable no-console */

import { StreamsClient } from '@stellar-starter-kit/sdk';
import type { StellarNetwork } from '@stellar-starter-kit/types';
import { getNetworkConfig } from '@stellar-starter-kit/contracts';
import { createSigner, getPublicKeyFromSecret } from './signer.js';
import { outputDryRun } from './transaction-printer.js';

export interface CommandContext {
  secretKey: string;
  contractId: string;
  network: StellarNetwork;
  dryRun: boolean;
}

async function createStreamsClient(ctx: CommandContext): Promise<StreamsClient> {
  const networkConfig = getNetworkConfig(ctx.network);
  const publicKey = getPublicKeyFromSecret(ctx.secretKey);
  const signer = createSigner(ctx.secretKey);

  return new StreamsClient({
    contractId: ctx.contractId,
    rpcUrl: networkConfig.rpcUrl,
    networkPassphrase: networkConfig.networkPassphrase,
    publicKey,
    signTransaction: signer,
  });
}

/**
 * Creates a new stream.
 */
export async function streamsCreate(
  ctx: CommandContext,
  recipient: string,
  token: string,
  amount: string,
  startTime: string,
  endTime: string,
  cliffTime: string,
): Promise<void> {
  try {
    const client = await createStreamsClient(ctx);
    const publicKey = getPublicKeyFromSecret(ctx.secretKey);

    const startTimeNum = Number(startTime);
    const endTimeNum = Number(endTime);
    const cliffTimeNum = Number(cliffTime);

    const params = {
      sender: publicKey,
      recipient,
      token,
      amount,
      startTime: startTimeNum,
      endTime: endTimeNum,
      cliffTime: cliffTimeNum,
    };

    console.log(`\nCreating stream on ${ctx.network}...`);
    console.log(`  Sender:    ${params.sender}`);
    console.log(`  Recipient: ${params.recipient}`);
    console.log(`  Token:     ${params.token}`);
    console.log(`  Amount:    ${params.amount} stroops`);
    console.log(`  Start:     ${new Date(params.startTime * 1000).toISOString()}`);
    console.log(`  End:       ${new Date(params.endTime * 1000).toISOString()}`);
    console.log(`  Cliff:     ${new Date(params.cliffTime * 1000).toISOString()}`);

    if (ctx.dryRun) {
      const details = [
        `Recipient: ${params.recipient}`,
        `Token:     ${params.token}`,
        `Amount:    ${params.amount}`,
        `Start:     ${new Date(params.startTime * 1000).toISOString()}`,
        `End:       ${new Date(params.endTime * 1000).toISOString()}`,
        `Cliff:     ${new Date(params.cliffTime * 1000).toISOString()}`,
      ].join('\n');
      outputDryRun('streams create', details);
      return;
    }

    const result = await client.createStream(params);
    console.log(`\n✓ Stream created successfully!`);
    console.log(`  Transaction: ${result.hash}\n`);
  } catch (error) {
    throw new Error(`Failed to create stream: ${(error as Error).message}`);
  }
}

/**
 * Retrieves and displays stream details.
 */
export async function streamsShow(
  ctx: CommandContext,
  streamId: string,
): Promise<void> {
  try {
    const client = await createStreamsClient(ctx);

    const stream = await client.getStream(BigInt(streamId));

    if (!stream) {
      console.log(`\n✗ Stream ${streamId} not found on ${ctx.network}.\n`);
      return;
    }

    const vested = await client.vested(BigInt(streamId));
    const claimable = await client.claimable(BigInt(streamId));

    console.log(`\n=== Stream ${stream.id} ===\n`);
    console.log(`Sender:          ${stream.sender}`);
    console.log(`Recipient:       ${stream.recipient}`);
    console.log(`Token:           ${stream.token}`);
    console.log(`Total Amount:    ${stream.totalAmount} stroops`);
    console.log(`Withdrawn:       ${stream.withdrawn} stroops`);
    console.log(`Vested So Far:   ${vested.toString()} stroops`);
    console.log(`Claimable Now:   ${claimable.toString()} stroops`);
    console.log(`Start Time:      ${new Date(stream.startTime * 1000).toISOString()}`);
    console.log(`End Time:        ${new Date(stream.endTime * 1000).toISOString()}`);
    console.log(`Cliff Time:      ${new Date(stream.cliffTime * 1000).toISOString()}`);
    console.log(`Cancelled:       ${stream.cancelled ? 'Yes' : 'No'}`);
    console.log();
  } catch (error) {
    throw new Error(`Failed to retrieve stream: ${(error as Error).message}`);
  }
}

/**
 * Withdraws from a stream.
 */
export async function streamsWithdraw(
  ctx: CommandContext,
  streamId: string,
): Promise<void> {
  try {
    const client = await createStreamsClient(ctx);

    console.log(`\nWithdrawing from stream ${streamId} on ${ctx.network}...`);

    if (ctx.dryRun) {
      const details = `Stream ID: ${streamId}`;
      outputDryRun('streams withdraw', details);
      return;
    }

    const result = await client.withdraw(BigInt(streamId));
    console.log(`\n✓ Withdrawal successful!`);
    console.log(`  Transaction: ${result.hash}\n`);
  } catch (error) {
    throw new Error(`Failed to withdraw from stream: ${(error as Error).message}`);
  }
}
