import { Keypair } from '@stellar/stellar-sdk';

/**
 * Creates a signer function from a secret key.
 * This function signs transactions and is compatible with StreamsClient's signTransaction callback.
 */
export function createSigner(
  secretKey: string,
): (xdr: string, opts: { networkPassphrase: string; address: string }) => Promise<string> {
  if (!isValidSecretKey(secretKey)) {
    throw new Error('Invalid secret key format. Secret keys must start with "S" followed by 56 alphanumeric characters.');
  }

  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecret(secretKey);
  } catch (error) {
    throw new Error(`Failed to create keypair from secret key: ${(error as Error).message}`);
  }

  return async (xdr: string, opts: { networkPassphrase: string; address: string }) => {
    try {
      // Import TransactionBuilder here to get the required types
      const { TransactionBuilder } = await import('@stellar/stellar-sdk');
      const tx = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${(error as Error).message}`);
    }
  };
}

/**
 * Gets the public key for a given secret key.
 */
export function getPublicKeyFromSecret(secretKey: string): string {
  if (!isValidSecretKey(secretKey)) {
    throw new Error('Invalid secret key format.');
  }
  try {
    const keypair = Keypair.fromSecret(secretKey);
    return keypair.publicKey();
  } catch (error) {
    throw new Error(`Failed to derive public key: ${(error as Error).message}`);
  }
}

/**
 * Validates that the secret key is a valid Stellar secret key.
 * Secret keys start with 'S' followed by 56 alphanumeric characters.
 */
function isValidSecretKey(key: string): boolean {
  return /^S[A-Z2-7]{55}$/.test(key);
}
