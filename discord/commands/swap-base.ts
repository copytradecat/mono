import { CommandInteraction } from 'discord.js';
import { getQuote, getSwapTransaction, getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import UserAccount from '../../src/models/User';
import Trade from '../../src/models/Trade';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { defaultSettings, Settings } from '../../src/components/BotSettings';
import dotenv from 'dotenv';
import { truncatedString } from '../../src/lib/utils';
import pLimit from 'p-limit';
import limiter from '../../src/lib/limiter';

dotenv.config({ path: ['../../.env.local', '../../.env'] });
const API_BASE_URL = process.env.SIGNING_SERVICE_URL;
const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);


export const swapTime = 5000; // 5 seconds // time to cancel the transaction

export async function getUser(userId: string) {
  const user = await UserAccount.findOne({ discordId: userId });
  if (!user || user.wallets.length === 0) {
    throw new Error('You need to set up your wallet first.');
  }
  return user;
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

  const estimatedOutput = Number(quoteData.outAmount) / 10 ** outputTokenInfo.decimals;

  const swapPreview = `
**Swap Preview**
From: ${Number(amount) / 10 ** inputTokenInfo.decimals} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenInfo.address}>)
To: ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenInfo.address}>)
Price Impact: ${(quoteData.priceImpactPct * 100).toFixed(2)}%
Slippage: ${
    settings.slippageType === 'fixed' ? `${(settings.slippage / 100).toFixed(2)}%` : 'Dynamic'
  }
Transaction Speed: ${settings.transactionSpeed}
Smart-MEV Protection: ${settings.smartMevProtection ? 'Enabled' : 'Disabled'}
Wrap/Unwrap SOL: ${settings.wrapUnwrapSOL ? 'Enabled' : 'Disabled'}
  `;

  return {
    quoteData,
    swapPreview,
    estimatedOutput,
    inputTokenInfo,
    outputTokenInfo,
  };
}

export async function executeSwapForUser(params: {
  interaction: CommandInteraction;
  user: any;
  wallet: any;
  selectedAmount: number;
  settings: any;
  outputTokenAddress: string;
  inputTokenAddress: string;
  isBuyOperation: boolean;
  inputTokenInfo: any;
  outputTokenInfo: any;
  estimatedOutput: number;
  initiatingUser: any;
  quoteData: any;
}) {
  const {
    interaction,
    user,
    wallet,
    selectedAmount,
    settings,
    outputTokenAddress,
    inputTokenAddress,
    isBuyOperation,
    inputTokenInfo,
    outputTokenInfo,
    estimatedOutput,
    initiatingUser,
    quoteData,
  } = params;

  try {
    const swapData = await getSwapTransaction(
      quoteData,
      wallet.publicKey,
      settings
    );

    const swapResult = await executeSwap(user.discordId, wallet.publicKey, swapData.swapTransaction);

    // Fetch token balances after the trade
    const { balance: inputBalanceAfter } = await getTokenBalance(wallet.publicKey, inputTokenAddress);
    const { balance: outputBalanceAfter } = await getTokenBalance(wallet.publicKey, outputTokenAddress);

    if (swapResult.success) {
      await recordTrade(
        user.discordId,
        wallet.publicKey,
        swapResult.signature,
        selectedAmount,
        isBuyOperation ? outputTokenAddress : inputTokenAddress
      );

      // Prepare the swap content message
      const swapContent = isBuyOperation
        ? `Bought: ${(estimatedOutput).toFixed(6)} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>) using ${(selectedAmount / 10 ** inputTokenInfo.decimals).toFixed(6)} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>)\n`
        : `Sold: ${(selectedAmount / 10 ** inputTokenInfo.decimals).toFixed(6)} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>) and received ${(estimatedOutput).toFixed(6)} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>)\n`;

      const balanceContent = `New Balances:\n- ${inputTokenInfo.symbol}: ${inputBalanceAfter.toFixed(6)}\n- ${outputTokenInfo.symbol}: ${outputBalanceAfter.toFixed(6)}`;

      // Send a direct message to the user about their trade
      try {
        const userDiscord = await interaction.client.users.fetch(user.discordId);
        await userDiscord.send({
          content: `**Swap performed successfully!**\n\n${swapContent}${balanceContent}\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)`,
        });
      } catch (dmError) {
        console.error('Failed to send DM to user:', dmError);
      }

      // If the user is the initiating user, edit the original interaction
      if (user.discordId === initiatingUser.discordId) {
        await interaction.editReply({
          content: `Swap Complete!\n\n${swapContent}\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)`,
          components: [],
        });
      }

      const publicMessage = `**${interaction.user.username}** ${isBuyOperation ? 'bought' : 'sold'} a **${selectionIndex}** amount of **[${isBuyOperation ? outputTokenInfo.symbol : inputTokenInfo.symbol}](<https://solscan.io/token/${isBuyOperation ? outputTokenAddress : inputTokenAddress}>)** at **${isBuyOperation ? estimatedOutput/amount : amount/estimatedOutput} ${outputTokenInfo.symbol}/${inputTokenInfo.symbol}**`;
      await interaction.channel?.send(publicMessage);
    } else {
      // Fetch token balances before the trade (assuming they haven't changed)
      const { balance: inputBalanceBefore } = await getTokenBalance(wallet.publicKey, inputTokenAddress);
      const { balance: outputBalanceBefore } = await getTokenBalance(wallet.publicKey, outputTokenAddress);

      const balanceContent = `Current Balances:\n- ${inputTokenInfo.symbol}: ${inputBalanceBefore.toFixed(6)}\n- ${outputTokenInfo.symbol}: ${outputBalanceBefore.toFixed(6)}`;

      let errorMessage = `Failed to execute trade for wallet ${wallet.publicKey}.\nReason: ${swapResult.transactionMessage}\nError Details: ${swapResult.error}\n\n${balanceContent}`;
      if (swapResult.signature) {
        errorMessage += `\nTransaction may still be processing. Check signature [${swapResult.signature}](<https://solscan.io/tx/${swapResult.signature}>).`;
      }
      // Send error message to the user via DM
      try {
        const userDiscord = await interaction.client.users.fetch(user.discordId);
        await userDiscord.send({
          content: errorMessage,
        });
      } catch (dmError) {
        console.error('Failed to send DM to user:', dmError);
      }
    }

    return swapResult;
  } catch (error: any) {
    console.error('Error executing swap:', error);
    // Fetch token balances before the trade (assuming they haven't changed)
    const { balance: inputBalance } = await getTokenBalance(wallet.publicKey, inputTokenAddress);
    const { balance: outputBalance } = await getTokenBalance(wallet.publicKey, outputTokenAddress);

    const balanceContent = `Current Balances:\n- ${inputTokenInfo.symbol}: ${inputBalance.toFixed(6)}\n- ${outputTokenInfo.symbol}: ${outputBalance.toFixed(6)}`;

    let errorMessage = `Failed to execute trade for wallet ${wallet.publicKey}. Please try again later.\n\n${balanceContent}`;
    // Send error message to the user via DM
    try {
      const userDiscord = await interaction.client.users.fetch(user.discordId);
      await userDiscord.send({
        content: errorMessage,
      });
    } catch (dmError) {
      console.error('Failed to send DM to user:', dmError);
    }
    return { success: false, error: error.message };
  }
}

export async function executeSwap(userId: string, walletPublicKey: string, swapTransaction: string) {
  try {
    // Optional: If your signing server has rate limits, wrap this call
    const response = await limiter.schedule({ id: `execute-swap-${userId}` }, async () => {
      return axios.post(`${API_BASE_URL}/sign-and-send`, {
        userId,
        walletPublicKey,
        serializedTransaction: swapTransaction,
      });
    });

    const { signature } = response.data;

    // const confirmed = await limiter.schedule({ id: `confirm-${signature}` }, async () => {
    //   return await connection.confirmTransaction(signature, 'confirmed');
    // });

    return {
      success: true,
      signature,
      error: null,
      transactionMessage: signature ? 'Transaction confirmed' : 'Transaction not confirmed',
    };
  } catch (error: any) {
    console.error('Swap execution failed:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Unknown error',
      transactionMessage: error.response?.data?.transactionMessage || 'No additional information',
      signature: error.response?.data?.signature || 'No signature',
    };
  }
}

export async function recordTrade(
  userId: string,
  walletAddress: string,
  signature: string,
  amount: number,
  token: string
) {
  await Trade.create({
    userId,
    walletAddress,
    txid: signature,
    amount,
    token,
  });
}