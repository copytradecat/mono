import {
  CommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from 'discord.js';
import { getQuote, getSwapTransaction, getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import UserAccount from '../../src/models/User';
import Trade from '../../src/models/Trade';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { defaultSettings, Settings } from '../../src/components/BotSettings';
import dotenv from 'dotenv';
import { truncatedString, mapSelectionToUserSettings } from '../../src/lib/utils';
import pLimit from 'p-limit';
import limiter from '../../src/lib/limiter';

dotenv.config({ path: ['../../.env.local', '../../.env'] });
const API_BASE_URL = process.env.SIGNING_SERVICE_URL;
const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);


export const swapTime = 5000; // Time to confirm the swap (in milliseconds)

// Function to generate selection buttons
export function generateSelectionButtons(labels: string[], customIdPrefix: string) {
  return labels.map((label, index) =>
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_${index}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary)
  );
}

// Function to prompt user for confirmation
export function promptUserConfirmation(
  interaction: CommandInteraction,
  content: string,
  ephemeral: boolean = false
): Promise<boolean> {
  return new Promise(async (resolve) => {
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('swap_now')
        .setLabel('Swap Now')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cancel_swap')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      content,
      components: [actionRow],
      ephemeral,
    });

    const filter = (i: any) =>
      i.user.id === interaction.user.id && (i.customId === 'swap_now' || i.customId === 'cancel_swap');

    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      componentType: ComponentType.Button,
      time: swapTime,
    });

    collector?.on('collect', async (i) => {
      await i.deferUpdate();
      collector.stop();
      resolve(i.customId === 'swap_now');
    });

    collector?.on('end', (collected, reason) => {
      if (reason === 'time') {
        resolve(false);
      }
    });
  });
}

// Function to execute swaps for multiple users
export async function executeSwapsForUsers(params: {
  interaction: CommandInteraction;
  connectedWallets: any[];
  selectionIndex: number | 'Custom';
  isBuyOperation: boolean;
  inputTokenInfo: any;
  outputTokenInfo: any;
  inputTokenAddress: string;
  outputTokenAddress: string;
  initiatingUser: any;
  initiatingSettings: Settings;
  initiatingEntryAmounts?: number[];
  initiatingExitPercentages?: number[];
  customAmount?: number;
  customPercentage?: number;
}) {
  const {
    interaction,
    connectedWallets,
    selectionIndex,
    isBuyOperation,
    inputTokenInfo,
    outputTokenInfo,
    inputTokenAddress,
    outputTokenAddress,
    initiatingUser,
    initiatingSettings,
    initiatingEntryAmounts,
    initiatingExitPercentages,
    customAmount,
    customPercentage,
  } = params;

  const tradeResults = [];

  const limit = pLimit(3); // Limit concurrent swaps to prevent rate limits

  await Promise.all(
    connectedWallets.map(walletInfo =>
      limit(async () => {
        try {
          const { user, wallet } = walletInfo;
          const walletPublicKey = wallet.publicKey;

          // Fetch the wallet's settings
          const walletSettings = user.wallets.find((w: any) => w.publicKey === walletPublicKey)?.settings
            || user.settings
            || defaultSettings;

          let adjustedAmount: number;
          let mappedAmount: number;

          if (isBuyOperation) {
            const userEntryAmounts = walletSettings.entryAmounts || defaultSettings.entryAmounts;
            // Map initiating user's selected amount to this user's settings
            mappedAmount = customAmount || mapSelectionToUserSettings(
              initiatingEntryAmounts!,
              userEntryAmounts,
              selectionIndex as number,
            );

            // Proceed to create swap preview and execute swap
            adjustedAmount = Math.floor(mappedAmount * 10 ** inputTokenInfo.decimals);

          } else {
            const userExitPercentages = walletSettings.exitPercentages || defaultSettings.exitPercentages;
            // Map initiating user's selected percentage to this user's settings
            const mappedPercentage = customPercentage || mapSelectionToUserSettings(
              initiatingExitPercentages!,
              userExitPercentages,
              selectionIndex as number,
            );

            // Get user's token balance
            const { balance: tokenBalanceRaw } = await getTokenBalance(walletPublicKey, inputTokenAddress);
            const tokenBalance = tokenBalanceRaw;

            mappedAmount = (mappedPercentage / 100) * tokenBalance;
            adjustedAmount = Math.floor(mappedAmount * (10 ** inputTokenInfo.decimals)); // Convert back to raw amount
          }

          // Create swap preview
          const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
            adjustedAmount,
            inputTokenAddress,
            outputTokenAddress,
            walletSettings,
            inputTokenInfo,
            outputTokenInfo
          );

          const swapResult = await executeSwapForUser({
            interaction,
            user,
            wallet,
            selectedAmount: adjustedAmount,
            settings: walletSettings,
            outputTokenAddress,
            inputTokenAddress,
            isBuyOperation,
            inputTokenInfo,
            outputTokenInfo,
            estimatedOutput: userEstimatedOutput,
            initiatingUser,
            quoteData: userQuoteData,
            selectionIndex,
          });

          tradeResults.push({
            user,
            swapResult,
            mappedAmount,
            estimatedOutput: userEstimatedOutput,
            inputTokenInfo,
            outputTokenInfo,
          });
        } catch (error) {
          console.error(`Error executing swap for wallet ${walletInfo.wallet.publicKey}:`, error);
        }
      })
    )
  );

  return tradeResults;
}

export async function getUser(userId: string) {
  const user = await UserAccount.findOne({ discordId: userId });
  if (!user || user.wallets.length === 0) {
    throw new Error('You need to set up your wallet first.');
  }
  return user;
}

export async function createSwapPreview(
  amount: number, // Raw amount in smallest units (integer)
  inputToken: string,
  outputToken: string,
  settings: Settings,
  inputTokenInfo: any,
  outputTokenInfo: any
) {
  try {
    const quoteData = await getQuote(
      inputToken,
      outputToken,
      amount,
      settings.slippageType === 'fixed'
        ? { type: 'fixed', value: settings.slippage }
        : { type: 'dynamic' }
    );

    if (!quoteData || !quoteData.outAmount) {
      throw new Error('Quote data is invalid or incomplete.');
    }

    const estimatedOutputRaw = Number(quoteData.outAmount);

    const amountHuman = amount / 10 ** inputTokenInfo.decimals;
    const estimatedOutput = estimatedOutputRaw / 10 ** outputTokenInfo.decimals;

    const swapPreview = `**Swap Preview**
From: ${amountHuman.toFixed(6)} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputToken}>)
To: ${estimatedOutput.toFixed(6)} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputToken}>)
Price Impact: ${(quoteData.priceImpactPct * 100).toFixed(2)}%
Slippage: ${
      settings.slippageType === 'fixed'
        ? `${(settings.slippage / 100).toFixed(2)}%`
        : 'Dynamic'
    }
Transaction Speed: ${settings.transactionSpeed}
Smart-MEV Protection: ${settings.smartMevProtection ? 'Enabled' : 'Disabled'}
Wrap/Unwrap SOL: ${settings.wrapUnwrapSOL ? 'Enabled' : 'Disabled'}
`;

    return {
      quoteData,
      swapPreview,
      estimatedOutput,
    };
  } catch (error: any) {
    console.error('Error creating swap preview:', error.message || error);
    throw new Error(`Failed to create swap preview: ${error.message || 'Unknown error'}`);
  }
}

// Modify executeSwapForUser to include selectionIndex
export async function executeSwapForUser(params: {
  interaction: CommandInteraction;
  user: any;
  wallet: any;
  selectedAmount: number;
  settings: Settings;
  outputTokenAddress: string;
  inputTokenAddress: string;
  isBuyOperation: boolean;
  inputTokenInfo: any;
  outputTokenInfo: any;
  estimatedOutput: number;
  initiatingUser: any;
  quoteData: any;
  selectionIndex?: number | 'Custom';
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
    selectionIndex,
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

    const truncatedWallet = truncatedString(wallet.publicKey, 4);

    if (swapResult.success) {
      await recordTrade(
        user.discordId,
        wallet.publicKey,
        swapResult.signature,
        selectedAmount,
        isBuyOperation ? outputTokenAddress : inputTokenAddress
      );

      const swapContent = isBuyOperation
        ? `Bought **${(estimatedOutput).toFixed(6)} ${outputTokenInfo.symbol}** with **${(selectedAmount / 10 ** inputTokenInfo.decimals).toFixed(6)} ${inputTokenInfo.symbol}**\n`
        : `Sold **${(selectedAmount / 10 ** inputTokenInfo.decimals).toFixed(6)} ${inputTokenInfo.symbol}** for **${(estimatedOutput).toFixed(6)} ${outputTokenInfo.symbol}**\n`;

      const balanceContent = `New Balances:\n- ${inputTokenInfo.symbol}: ${inputBalanceAfter.toFixed(6)}\n- ${outputTokenInfo.symbol}: ${outputBalanceAfter.toFixed(6)}`;

      // Send a direct message to the user about their trade
      if (user.discordId === initiatingUser.discordId) {
        await interaction.editReply({
          content: `Swap Complete!\n\n${swapContent}\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)\nWallet: [${truncatedWallet}](<https://solscan.io/account/${wallet.publicKey}>)`,
          components: [],
        });
      } else {
        try {
          const userDiscord = await interaction.client.users.fetch(user.discordId);
          await userDiscord.send({
            content: `**Swap performed successfully!**\n\n${swapContent}${balanceContent}\n
            Transaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)\n
            Wallet: [${truncatedWallet}](<https://solscan.io/account/${wallet.publicKey}>)`,
          });
        } catch (dmError) {
          console.error('Failed to send DM to user:', dmError);
        }
      }

      // Prepare public message
      const selectionLabels = isBuyOperation
        ? ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌', 'Massive 🦍', 'MEGAMOON 🌝']
        : ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌'];

      const selectionLabel =
        selectionIndex !== undefined &&
        selectionIndex !== 'Custom' &&
        selectionLabels[selectionIndex]
          ? selectionLabels[selectionIndex]
          : 'Custom';

      const publicMessage = `**${user.username || user.discordId}** ${
        isBuyOperation ? 'bought' : 'sold'
      } a **${selectionLabel}** amount of **[${isBuyOperation ? outputTokenInfo.symbol : inputTokenInfo.symbol}](<https://solscan.io/token/${
        isBuyOperation ? outputTokenAddress : inputTokenAddress
      }>)** at **${isBuyOperation ? (estimatedOutput/selectedAmount).toFixed(8) : (selectedAmount/estimatedOutput).toFixed(8)} ${outputTokenInfo.symbol}/${inputTokenInfo.symbol}**`;

      // Send public message to the channel
      await interaction.channel?.send(publicMessage);

      return swapResult;
    } else {
      let errorMessage = `Failed to execute ${isBuyOperation ? 'buy' : 'sell'} order for wallet [${truncatedWallet}](<https://solscan.io/account/${wallet.publicKey}>).`;
      if (swapResult.transactionMessage && swapResult.transactionMessage!="No additional information") {
        errorMessage += `\nReason: ${swapResult.transactionMessage}`;
      }
      if (swapResult.error) {
        errorMessage += `\nError Details: ${swapResult.error}`;
      }
      if (swapResult.signature && swapResult.signature!="No signature") {
        errorMessage += `\nTransaction may still be processing.${swapResult.signature && `\nCheck signature [${swapResult.signature}](<https://solscan.io/tx/${swapResult.signature}>).`}`;
      }

      if (user.discordId === initiatingUser.discordId) {
        await interaction.editReply({
          content: errorMessage,
          components: [],
        });
      } else {
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
    }

  } catch (error: any) {
    console.error('Error executing swap:', error);
    const truncatedWallet = truncatedString(wallet.publicKey, 4);
    let errorMessage = `Failed to execute ${isBuyOperation ? 'buy' : 'sell'} order for wallet [${truncatedWallet}](<https://solscan.io/account/${wallet.publicKey}>).\n`;
    if (error.message) {
      errorMessage += `Error Details: ${error.message}`;
    }

    if (user.discordId === initiatingUser.discordId) {
      await interaction.editReply({
        content: errorMessage,
        components: [],
      });
    } else {
      try {
        const userDiscord = await interaction.client.users.fetch(user.discordId);
        await userDiscord.send({
          content: errorMessage,
        });
      } catch (dmError) {
        console.error('Failed to send DM to user:', dmError);
      }
    }
    return { success: false, error: error.message };
  }
}

// Modify executeSwap to handle transaction confirmation
export async function executeSwap(userId: string, walletPublicKey: string, swapTransaction: string) {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const response = await limiter.schedule({ id: `execute-swap-${userId}` }, async () => {
        return axios.post(`${API_BASE_URL}/sign-and-send`, {
          userId,
          walletPublicKey,
          serializedTransaction: swapTransaction,
        });
      });

      const { signature } = response.data;

      // Optionally wait for the transaction to be confirmed
      // const confirmed = await connection.confirmTransaction(signature, 'confirmed');

      return {
        success: true,
        signature,
        error: null,
        transactionMessage: signature ? 'Transaction submitted' : 'Transaction not submitted',
      };
    } catch (error: any) {
      console.error(`Swap execution failed (attempt ${retryCount + 1}):`, error);

      if (error.response?.status === 429) {
        retryCount++;
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else {
        return {
          success: false,
          error: error.response?.data?.error || error.message || 'Unknown error',
          transactionMessage: error.response?.data?.transactionMessage || 'No additional information',
          signature: error.response?.data?.signature || 'No signature',
        };
      }
    }
  }

  return {
    success: false,
    error: 'Max retries reached',
    transactionMessage: 'Failed to execute swap after multiple attempts',
    signature: 'No signature',
  };
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