import { CommandInteraction, MessageReaction, User } from 'discord.js';
import { getQuote, getSwapTransaction, getTokenInfo } from '../../src/services/jupiter.service';
import UserAccount from '../../src/models/User';
import Trade from '../../src/models/Trade';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { defaultSettings, Settings } from '../../src/components/BotSettings';
import dotenv from 'dotenv';

dotenv.config({ path: ['../../.env.local', '../../.env'] });
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const swapTime = 5000; // 5 seconds // time to cancel the transaction

export async function getUser(userId: string) {
  const user = await UserAccount.findOne({ name: userId });
  if (!user || user.wallets.length === 0) {
    throw new Error('You need to set up your wallet first.');
  }
  return user;
}

export async function getBalance(publicKey: string) {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
  return await connection.getBalance(new PublicKey(publicKey));
}

export async function createSwapPreview(amount: number, inputToken: string, outputToken: string, settings: Settings) {
  const quoteData = await getQuote(
    inputToken,
    outputToken,
    amount,
    settings.slippageType === 'fixed' 
      ? { type: 'fixed' as const, value: settings.slippage }
      : { type: 'dynamic' as const }
  );
  const inputTokenInfo = await getTokenInfo(inputToken);
  const outputTokenInfo = await getTokenInfo(outputToken);

  const estimatedOutput = quoteData.outAmount / 10 ** outputTokenInfo.decimals; // Assuming output token has 9 decimals
  return {
    quoteData,
    swapPreview: `Swap Preview:
From: ${(amount / 10 ** inputTokenInfo.decimals)} ${inputToken === 'So11111111111111111111111111111111111111112' ? 'SOL' : inputToken}
To: ${estimatedOutput} ${outputToken === 'So11111111111111111111111111111111111111112' ? 'SOL' : outputToken}
Price Impact: ${(quoteData.priceImpactPct * 100)}%
Slippage: ${settings.slippageType === 'fixed' ? `${settings.slippage/100}%` : 'Dynamic'}
Transaction Speed: ${settings.transactionSpeed}
Smart-MEV Protection: ${settings.smartMevProtection}
Wrap/Unwrap SOL: ${settings.wrapUnwrapSOL ? 'Enabled' : 'Disabled'}
React with 🗑️ within ${swapTime/1000} seconds to cancel the transaction.`
  };
}

export async function executeSwap(userId: string, walletPublicKey: string, swapTransaction: string) {
  try {
    const response = await axios.post(`${API_BASE_URL}/sign-and-send`, {
      userId,
      walletPublicKey,
      serializedTransaction: swapTransaction,
    });

    return { success: true, signature: response.data.signature };
  } catch (error) {
    console.error('Swap execution failed:', error);
    return { 
      success: false, 
      error: error.response?.data?.error || 'Unknown error',
      transactionMessage: error.response?.data?.transactionMessage || 'No additional information'
    };
  }
}

export async function recordTrade(userId: string, walletAddress: string, signature: string, amount: number, token: string) {
  await Trade.create({
    userId,
    walletAddress,
    txid: signature,
    amount,
    token,
  });
}

export function createMessageCollector(message: any, filter: any, time: number) {
  return message.createReactionCollector({ filter, time });
}
