import axios from 'axios';
import { Connection, Commitment, TransactionSignature, TransactionResponse, PublicKey, ParsedInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config();

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

export function getAmountTransferredFromTransaction(
  txInfo: TransactionResponse,
  userWalletAddress: string,
  poolingWalletAddress: string,
  tokenAddress: string,
  expectedAmount: number
): number {
  const walletPubkey = new PublicKey(userWalletAddress);
  const tokenMintAddress = new PublicKey(tokenAddress);

  try {
    if (!txInfo) {
      console.error("Transaction not found");
      return 0;
    }

    const isNativeSOL =
      tokenAddress === "So11111111111111111111111111111111111111112" ||
      tokenAddress === "11111111111111111111111111111111";

    if (isNativeSOL) {
      // Handle SOL transfers by looking at preBalances and postBalances
      const accountKeys = txInfo.transaction.message.accountKeys;
      const userIndex = accountKeys.findIndex(
        (key) => key.toBase58() === userWalletAddress
      );
      const poolIndex = accountKeys.findIndex(
        (key) => key.toBase58() === process.env.POOLING_WALLET_ADDRESS
      );

      if (userIndex === -1 || poolIndex === -1) {
        console.error("User or pooling wallet not found in transaction");
        return 0;
      }

      const preBalanceUser = txInfo.meta?.preBalances[userIndex];
      const postBalanceUser = txInfo.meta?.postBalances[userIndex];
      const preBalancePool = txInfo.meta?.preBalances[poolIndex];
      const postBalancePool = txInfo.meta?.postBalances[poolIndex];

      const fee = txInfo.meta?.fee || 0;
      // Amount transferred from user (excluding fee)
      const amountDeductedFromUser = (preBalanceUser ?? 0) - (postBalanceUser ?? 0) - fee;

      // Amount received by the pooling wallet
      const amountReceivedByPool = (postBalancePool ?? 0) - (preBalancePool ?? 0);

      // We can cross-verify these amounts
      if (amountReceivedByPool >= 0 && amountDeductedFromUser >= 0) {
        return amountReceivedByPool;
      } else {
        return 0;
      }
    } else {
      // Handle SPL token transfers
      const preTokenBalances = txInfo.meta?.preTokenBalances || [];
      const postTokenBalances = txInfo.meta?.postTokenBalances || [];

      // Find the relevant token balances for the user's wallet
      const preBalance = preTokenBalances.find(
        balance => balance.owner === userWalletAddress && 
                  balance.mint === tokenAddress
      );
      const postBalance = postTokenBalances.find(
        balance => balance.owner === userWalletAddress && 
                  balance.mint === tokenAddress
      );

      if (preBalance && postBalance) {
        const amountTransferred = Number(preBalance.uiTokenAmount.amount) - 
                                 Number(postBalance.uiTokenAmount.amount);
        
        // Verify the amount is close to expected (within 1% tolerance)
        const tolerance = expectedAmount * 0.01;
        if (Math.abs(amountTransferred - expectedAmount) <= tolerance) {
          return amountTransferred;
        }
        
        console.log('Transfer amount outside tolerance:', {
          expected: expectedAmount,
          actual: amountTransferred,
          tolerance
        });
      }

      // If we couldn't verify the transfer through token balances,
      // check the instruction data
      for (const ix of txInfo.transaction.message.instructions) {
        const programId = new PublicKey(txInfo.transaction.message.accountKeys[ix.programIdIndex]);
        if (programId.equals(TOKEN_PROGRAM_ID)) {
          const data = Buffer.from(ix.data);
          // Check if this is a TransferChecked instruction (instruction index 12)
          if (data[0] === 12) {
            const amount = data.readBigUInt64LE(1);
            return Number(amount);
          }
        }
      }
    }
    return 0;
  } catch (error: any) {
    console.error("Error processing transaction: ", error);
    return 0;
  }
}

