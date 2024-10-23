import axios from 'axios';
import { Connection, Commitment, TransactionSignature } from '@solana/web3.js';

const SIGNING_SERVICE_URL = process.env.SIGNING_SERVICE_URL || 'http://localhost:3001';

export async function signAndSendTransaction(
  userId: string,
  walletPublicKey: string,
  serializedTransaction: string,
  token: string
): Promise<string> {
  try {
    const response = await axios.post(
      `${SIGNING_SERVICE_URL}/sign-and-send`,
      {
        userId,
        walletPublicKey,
        serializedTransaction,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data.signature;
  } catch (error) {
    console.error('Error signing and sending transaction:', error);
    throw new Error('Failed to sign and send transaction');
  }
}


export async function confirmTransactionWithRetry(
  connection: Connection,
  signature: TransactionSignature,
  commitment: Commitment = 'confirmed',
  maxRetries: number = 20,
  interval: number = 1000
): Promise<void> {
  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      const latestBlockhash = await connection.getLatestBlockhash(commitment);
      const response = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        commitment
      );
      if (response.value.err) {
        throw new Error(`Transaction failed: ${response.value.err.toString()}`);
      }
      // Transaction is confirmed
      return;
    } catch (error: any) {
      if (
        error.message.includes('Transaction was not confirmed') ||
        error.message.includes('has not been confirmed')
      ) {
        console.log(`Retry ${retryCount + 1}/${maxRetries} for signature ${signature}`);
        await new Promise((resolve) => setTimeout(resolve, interval));
        retryCount++;
      } else {
        // For other errors, rethrow them
        throw error;
      }
    }
  }
  throw new Error(`Transaction ${signature} was not confirmed after ${maxRetries} retries.`);
}
