import { StreamsClient } from '@stellar-starter-kit/sdk';
import { formatStroopsToXlm } from '@stellar-starter-kit/utils';
import { Keypair } from '@stellar/stellar-sdk';

/**
 * Basic Payment Example: Create a stream on Stellar Testnet
 *
 * This example demonstrates how to:
 * 1. Initialize a StreamsClient
 * 2. Create a simple stream (payment vesting)
 * 3. Print the transaction hash and stream id
 *
 * Prerequisites:
 * - Set STREAM_CONTRACT_ID in .env
 * - Have testnet XLM available to create a stream
 */

async function main() {
  // Load environment variables
  const streamContractId = process.env.STREAM_CONTRACT_ID;
  const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  const networkPassphrase = process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';

  if (!streamContractId) {
    throw new Error(
      'STREAM_CONTRACT_ID environment variable is required. ' +
        'See .env.example for setup instructions.',
    );
  }

  // For this demo, we'll create a keypair from a seed phrase (you'd normally use a wallet).
  // In production, use a real wallet like Freighter.
  const senderSeed = process.env.SENDER_SEED;
  if (!senderSeed) {
    throw new Error('SENDER_SEED environment variable is required. See .env.example.');
  }

  const senderKeypair = Keypair.fromSecret(senderSeed);
  const senderAddress = senderKeypair.publicKey();

  // The recipient address (in this example, a hardcoded test address)
  const recipientAddress = process.env.RECIPIENT_ADDRESS;
  if (!recipientAddress) {
    throw new Error('RECIPIENT_ADDRESS environment variable is required. See .env.example.');
  }

  // XLM token contract on Testnet (SAC - Stellar Asset Contract)
  const xlmTokenContract = process.env.TOKEN_CONTRACT_ID || 
    'CDLZFC3SYJYDZT7K67VZ75HPJGWGN6XXU250DEX2ZJ26C6EU5R144Z7X';

  console.log('🚀 Stellar Streams Basic Payment Example\n');
  console.log(`Sender:    ${senderAddress}`);
  console.log(`Recipient: ${recipientAddress}`);
  console.log(`Contract:  ${streamContractId}\n`);

  // Create the client
  const client = new StreamsClient({
    contractId: streamContractId,
    rpcUrl,
    networkPassphrase,
    publicKey: senderAddress,
    signTransaction: async (xdr, opts) => {
      // In this example, we sign locally with the keypair.
      // In a browser, you would use wallet.signTransaction(xdr).
      const tx = require('@stellar/stellar-sdk').TransactionBuilder.fromXDR(xdr, opts.networkPassphrase);
      tx.sign(senderKeypair);
      return tx.toXDR();
    },
  });

  try {
    // Stream 10 XLM over 30 days starting now
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysFromNow = now + 30 * 86_400;

    const amount = '1000000000n'; // 10 XLM in stroops (1 XLM = 10^7 stroops)

    console.log('📤 Creating stream...');
    console.log(`   Amount:   ${formatStroopsToXlm(BigInt(amount))} XLM`);
    console.log(`   Duration: 30 days\n`);

    const result = await client.createStream({
      sender: senderAddress,
      recipient: recipientAddress,
      token: xlmTokenContract,
      amount: amount,
      startTime: now,
      endTime: thirtyDaysFromNow,
      cliffTime: now, // No cliff; vesting starts immediately
    });

    console.log('✅ Stream created successfully!\n');
    console.log(`Transaction Hash: ${result.hash}`);

    // Fetch the next stream id (the one we just created would be next_id - 1)
    const nextId = await client.nextStreamId();
    const streamId = nextId - 1n;

    console.log(`Stream ID:        ${streamId}\n`);

    // Fetch and display stream details
    const stream = await client.getStream(streamId);
    if (stream) {
      console.log('📊 Stream Details:');
      console.log(`   ID:            ${stream.id}`);
      console.log(`   Sender:        ${stream.sender}`);
      console.log(`   Recipient:     ${stream.recipient}`);
      console.log(`   Total Amount:  ${formatStroopsToXlm(BigInt(stream.totalAmount))} XLM`);
      console.log(`   Vesting Days:  30`);
      console.log(`   Cliff:         None (vests immediately)`);
    }

    console.log(
      '\n📌 Explorer link: https://stellar.expert/explorer/testnet/tx/' + result.hash,
    );
  } catch (error) {
    console.error('❌ Error creating stream:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
