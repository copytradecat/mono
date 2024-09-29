import { CommandInteraction, MessageReaction, User, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getQuote, getSwapTransaction, getTokenInfo } from '../../src/services/jupiter.service';
import UserAccount from '../../src/models/User';
import Trade from '../../src/models/Trade';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { defaultSettings, Settings } from '../../src/components/BotSettings';
import dotenv from 'dotenv';
import { truncatedString } from '../../src/lib/utils';

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
  const balanceLamports = await connection.getBalance(new PublicKey(publicKey));
  return balanceLamports;
}

export async function createSwapPreview(
  amount: number,
  inputToken: string,
  outputToken: string,
  settings: Settings
) {
  const quoteData = await getQuote(
    inputToken,
    outputToken,
    amount,
    settings.slippageType === 'fixed'
      ? { type: 'fixed', value: settings.slippage }
      : { type: 'dynamic' }
  );
  const inputTokenInfo = await getTokenInfo(inputToken);
  const outputTokenInfo = await getTokenInfo(outputToken);
  console.log("quoteData", quoteData);

  const estimatedOutput = quoteData.outAmount / 10 ** outputTokenInfo.decimals;

  const swapPreview = `Swap Preview:
From: ${(amount / 10 ** inputTokenInfo.decimals)} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenInfo.address}>)
To: ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenInfo.address}>)
Price Impact: ${(quoteData.priceImpactPct * 100)}%
Slippage: ${
    settings.slippageType === 'fixed' ? `${settings.slippage / 100}%` : 'Dynamic'
  }
Transaction Speed: ${settings.transactionSpeed}
Smart-MEV Protection: ${settings.smartMevProtection}
Wrap/Unwrap SOL: ${settings.wrapUnwrapSOL ? 'Enabled' : 'Disabled'}`;

  return {
    quoteData,
    swapPreview,
    estimatedOutput,
    inputTokenInfo,
    outputTokenInfo,
  };
}

export async function executeSwap(userId: string, walletPublicKey: string, swapTransaction: string) {
  try {
    const response = await axios.post(`${API_BASE_URL}/sign-and-send`, {
      userId,
      walletPublicKey,
      serializedTransaction: swapTransaction,
    });

    const { signature } = response.data;
    const confirmed = await confirmTransaction(signature);

    return { 
      success: confirmed, 
      signature,
      error: confirmed ? null : 'Transaction timed out',
      transactionMessage: confirmed ? 'Transaction confirmed' : 'Transaction sent but not confirmed'
    };
  } catch (error: any) {
    console.error('Swap execution failed:', error);
    return { 
      success: false, 
      error: error.response?.data?.error || error.message || 'Unknown error',
      transactionMessage: error.response?.data?.transactionMessage || 'No additional information',
      signature: error.response?.data?.signature || 'No signature'
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

export async function confirmTransaction(signature: string, maxRetries: number = 5, retryDelay: number = 5000): Promise<boolean> {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await connection.confirmTransaction(signature, 'confirmed');
      return true;
    } catch (error) {
      if (i === maxRetries - 1) {
        console.error('Transaction confirmation failed:', error);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  return false;
}

export async function executeSwapTransaction(
  interaction: CommandInteraction,
  userId: string,
  wallet: any,
  quoteData: any,
  settings: any,
  amount: number,
  inputTokenAddress: string,
  outputTokenAddress: string,
  inputTokenInfo: any,
  outputTokenInfo: any,
  estimatedOutput: number,
  isBuyOperation: boolean,
  selectionIndexOptions: string[],
  selectionPercentages: number[]
) {
  try {
    const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
    
    // Update message to show that the transaction is being sent
    await interaction.editReply({
      content: 'Sending transaction...',
      components: [],
    });

    const swapResult = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);

    // Update message with transaction signature as soon as it's available
    if (swapResult.signature) {
      await interaction.editReply({
        content: `Transaction sent! Waiting for confirmation...\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)`,
        components: [],
      });
    }

    if (swapResult.success) {
      await recordTrade(userId, wallet.publicKey, swapResult.signature, amount, isBuyOperation ? outputTokenAddress : inputTokenAddress);

      let selectionIndex = 'Custom';
      if (!isBuyOperation) {
        const exitPercentage = (amount / inputTokenInfo.balance) * 100;
        const percentageIndex = selectionPercentages.findIndex(p => Math.abs(p - exitPercentage) < 0.01);
        if (percentageIndex !== -1) {
          selectionIndex = selectionIndexOptions[percentageIndex];
        }
      } else {
        const amountIndex = selectionPercentages.findIndex(p => Math.abs(p - amount) < 0.00001);
        if (amountIndex !== -1) {
          selectionIndex = selectionIndexOptions[amountIndex];
        }
      }

      const swapContent = isBuyOperation
        ? `Bought: ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>)\nUsing: ${amount} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>)`
        : `Sold: ${amount} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>)\nReceived: ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>)`;

      await interaction.editReply({
        content: `Swap Complete!\n\n${swapContent}\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)`,
        components: [],
      });

      const publicMessage = `**${interaction.user.username}** ${isBuyOperation ? 'bought' : 'sold'} a **${selectionIndex}** amount of **[${isBuyOperation ? outputTokenInfo.symbol : inputTokenInfo.symbol}](<https://solscan.io/token/${isBuyOperation ? outputTokenAddress : inputTokenAddress}>)** at **${isBuyOperation ? estimatedOutput/amount : amount/estimatedOutput} ${outputTokenInfo.symbol}/${inputTokenInfo.symbol}**`;
      await interaction.channel?.send(publicMessage);
    } else {
      let errorMessage = `Failed to execute ${isBuyOperation ? 'buy' : 'sell'} order. Reason: ${swapResult.transactionMessage}\n\nError details: ${swapResult.error}`;
      if (swapResult.signature) {
        errorMessage += `\nTransaction may still be processing. Check signature ${swapResult.signature} using the Solana Explorer or CLI tools.`;
      }
      await interaction.editReply({
        content: errorMessage,
        components: [],
      });
    }
  } catch (error: any) {
    console.error('Error executing swap:', error);
    let errorMessage = `Failed to execute ${isBuyOperation ? 'buy' : 'sell'} order. Please try again later.`;
    await interaction.editReply({
      content: errorMessage,
      components: [],
    });
  }
}