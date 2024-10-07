import {
  CommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  userMention
} from 'discord.js';
import { getQuote, getSwapTransaction, getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import UserAccount from '../../src/models/User';
import Trade from '../../src/models/Trade';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { defaultSettings, Settings } from '../../src/components/BotSettings';
import { truncatedString, mapSelectionToUserSettings } from '../../src/lib/utils';
import pLimit from 'p-limit';
import limiter from '../../src/lib/limiter';
import '../../env.ts';

const API_BASE_URL = process.env.SIGNING_SERVICE_URL;

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
): Promise<'swap_now' | 'cancel_swap' | 'timeout'> {
  return new Promise(async (resolve) => {
    try {
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
    if (!interaction.isRepliable()) {
      console.log('Interaction is no longer valid');
      return;
    }
    await interaction.editReply({
      content,
      components: [actionRow],
    });

    const filter = (i: any) =>
      i.user.id === interaction.user.id && (i.customId === 'swap_now' || i.customId === 'cancel_swap');

    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      componentType: ComponentType.Button,
      time: swapTime + 2400, // add buffer
    });

    collector?.on('collect', async (i) => {
      await i.deferUpdate();
      collector.stop();
      resolve(i.customId as 'swap_now' | 'cancel_swap');
    });

    collector?.on('end', async (collected, reason) => {
      if (reason === 'time') {
        resolve('timeout');
        await interaction.editReply({
          content: 'Processing swap...',
          components: [],
        });
      }
    });

    } catch (error) {
      console.error('Error in promptUserConfirmation:', error);
      resolve('cancel_swap');
    }
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
  channelId?: string;
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
    channelId
  } = params;

  const tradeResults = [];

  const limit = pLimit(Number(process.env.LIMIT_CONCURRENCY) || 5);

  const successfulSwaps: any[] = [];
  const failedSwaps: any[] = [];

  if (!connectedWallets.some((walletInfo) => walletInfo.user.discordId === initiatingUser.discordId)) {
    console.log(`\n\n\nInitiating user not found in connected wallets! Adding ${initiatingUser.discordId} to connected wallets.`)
    const initiatingWallet = initiatingUser.wallets.find((wallet: any) => wallet.connectedChannels[0] === channelId );
    if (initiatingWallet) {
      connectedWallets.push({ user: initiatingUser.discordId, wallet: initiatingWallet });
    } else {
      console.log(`Initiating user ${initiatingUser.discordId} has not connected wallet to channel ${channelId}!`)
    }
  } else {
    console.log(`\n\n\nInitiating user found in connected wallets!`)
  }

  await Promise.all(
    connectedWallets.map((walletInfo) =>
      limit(async () => {
        try {
          const { user, wallet } = walletInfo;
          const walletPublicKey = wallet.publicKey;

          // Fetch the wallet's settings with the correct order of precedence
          const walletSettings = wallet.settings;
          const primaryPreset = user.primaryPresetId ? user.presets.find(p => p._id.toString() === user.primaryPresetId.toString()) : null;
          const userSettings = walletSettings || (primaryPreset ? primaryPreset.settings : null) || user.settings || defaultSettings;

          let adjustedAmount: number;
          let mappedAmount: number;

          if (isBuyOperation) {
            const userEntryAmounts = userSettings.entryAmounts || defaultSettings.entryAmounts;
            mappedAmount =
              customAmount ||
              mapSelectionToUserSettings(initiatingEntryAmounts!, userEntryAmounts, selectionIndex as number);

            // Convert mappedAmount to raw units
            adjustedAmount = Math.floor(mappedAmount * 10 ** inputTokenInfo.decimals);

            // Fetch wallet balance in raw units
            const { balance: walletBalance } = await getTokenBalance(walletPublicKey, inputTokenAddress);

            if (walletBalance < adjustedAmount) {
              console.error(`Insufficient balance for wallet ${walletPublicKey}`);
              await notifyUserInsufficientBalance(user, walletPublicKey, inputTokenInfo.symbol, interaction);
              return; // Skip this wallet
            }
          } else {
            const userExitPercentages = userSettings.exitPercentages || defaultSettings.exitPercentages;
            const mappedPercentage = customPercentage || mapSelectionToUserSettings(
              initiatingExitPercentages!,
              userExitPercentages,
              selectionIndex as number,
            );

            const { balance: tokenBalance } = await getTokenBalance(walletPublicKey, inputTokenAddress);
            mappedAmount = (mappedPercentage / 100) * tokenBalance;
            adjustedAmount = Math.floor(mappedAmount);

            if (adjustedAmount <= 0 || tokenBalance < adjustedAmount) {
              console.error(`Insufficient balance for wallet ${walletPublicKey} adjustedAmount <= 0 || tokenBalance < adjustedAmount`);
              await notifyUserInsufficientBalance(user, walletPublicKey, inputTokenInfo.symbol, interaction);
              return; // Skip this wallet
            }
          }

          // Create swap preview
          const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
            adjustedAmount,
            inputTokenAddress,
            outputTokenAddress,
            userSettings,
            inputTokenInfo,
            outputTokenInfo
          );

          const swapResult = await executeSwapForUser({
            interaction,
            user,
            wallet,
            selectedAmount: adjustedAmount,
            settings: userSettings,
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

          if (swapResult.success) {
            successfulSwaps.push({ user, wallet, swapResult });
          } else {
            failedSwaps.push({ user, wallet, swapResult });
          }

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

  // After all swaps are complete, send public message
  const selectionLabels = isBuyOperation
    ? ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌', 'Massive 🦍', 'MEGAMOON 🌝']
    : ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌'];

  const selectionLabel = selectionIndex !== undefined && selectionLabels[selectionIndex]
    ? selectionLabels[selectionIndex]
    : 'Custom';

  const publicMessage = `${userMention(initiatingUser.discordId)} ${
    isBuyOperation ? 'bought' : 'sold'
  } a **${selectionLabel}** amount of **[${isBuyOperation ? outputTokenInfo.symbol : inputTokenInfo.symbol}](<https://solscan.io/token/${
    isBuyOperation ? outputTokenAddress : inputTokenAddress
  }>)**.${ // include details about the number of followers who also swapped
    successfulSwaps.length > 1 ? `\n${successfulSwaps.length - 1} follower${successfulSwaps.length > 2 ? 's' : ''} also executed the swap.` : ''
  }`;

  // if (successfulSwaps.length > 0) {
    await interaction.channel?.send(publicMessage);
  // }

  return tradeResults;
}

// Helper function to notify the user about insufficient balance
async function notifyUserInsufficientBalance(
  user: any,
  walletPublicKey: string,
  tokenSymbol: string,
  interaction: CommandInteraction
) {
  const truncatedWallet = truncatedString(walletPublicKey, 4);
  const message = `Your wallet [${truncatedWallet}](<https://solscan.io/account/${walletPublicKey}>) does not have enough ${tokenSymbol} to execute the swap.`;

  try {
    if (user.discordId === interaction.user.id) {
      // Send an ephemeral message to the initiating user
      await interaction.followUp({
        content: message,
        ephemeral: true,
      });
    } else {
      // Send a DM to other users
      const userDiscord = await interaction.client.users.fetch(user.discordId);
      await userDiscord.send({
        content: message,
      });
    }
  } catch (error) {
    console.error('Failed to send insufficient balance notification:', error);
  }
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
  console.log(`createSwapPreview: ${amount} ${inputToken} for ${outputToken}`);
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

    console.log(`Swapping ${amountHuman} ${inputTokenInfo.symbol} for ${estimatedOutput} ${outputTokenInfo.symbol}`);
    // console.log(`estimatedOutput = estimatedOutputRaw / 10 ** outputTokenInfo.decimals = ${estimatedOutputRaw} / 10 ** ${outputTokenInfo.decimals} = ${estimatedOutput}`);

    const swapPreview = `**Swap Preview**
From: ${amountHuman.toFixed(6)} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputToken}>)
To: ${estimatedOutput.toFixed(6)} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputToken}>)
Price Impact: ${(quoteData.priceImpactPct * 100).toFixed(2)}%
Slippage: ${
      settings.slippageType === 'fixed'
        ? `${(settings.slippage ? (settings.slippage / 100).toFixed(2) : '0.00')}%`
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
  settings: any;
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

    // Initial slippage and max slippage in basis points (e.g., 100 bps = 1%)
    const originalSlippage = settings.slippage;
    const maxSlippage = 500; // Maximum slippage of 5%

    const swapResult = await executeSwap(
      user.discordId,
      wallet.publicKey,
      swapData.swapTransaction,
      originalSlippage,
      maxSlippage
    );

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
        ? `Bought **${(estimatedOutput / 10 ** outputTokenInfo.decimals).toFixed(6)} ${outputTokenInfo.symbol}** with **${(selectedAmount / 10 ** inputTokenInfo.decimals).toFixed(6)} ${inputTokenInfo.symbol}**\n`
        : `Sold **${(selectedAmount / 10 ** inputTokenInfo.decimals).toFixed(6)} ${inputTokenInfo.symbol}** for **${(estimatedOutput / 10 ** outputTokenInfo.decimals).toFixed(6)} ${outputTokenInfo.symbol}**\n`;

      const balanceContent = `New Balances:\n- ${inputTokenInfo.symbol}: ${(inputBalanceAfter / 10 ** inputTokenInfo.decimals).toFixed(6)}\n- ${outputTokenInfo.symbol}: ${(outputBalanceAfter / 10 ** outputTokenInfo.decimals).toFixed(6)}`;

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
            content: `**Swap performed successfully!**\n\n${swapContent}${balanceContent}\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)\nWallet: [${truncatedWallet}](<https://solscan.io/account/${wallet.publicKey}>)`,
          });
        } catch (dmError) {
          console.error('Failed to send DM to user:', dmError);
        }
      }

      return swapResult;
    } else {
      // Handle failure
      let errorMessage = `Failed to ${isBuyOperation ? 'buy' : 'sell'} ${selectedAmount / 10 ** inputTokenInfo.decimals} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>) for ${estimatedOutput / 10 ** outputTokenInfo.decimals} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>) on wallet [${truncatedWallet}](<https://solscan.io/account/${wallet.publicKey}>).`;
      if (swapResult.transactionMessage && swapResult.transactionMessage !== "No additional information") {
        errorMessage += `\nReason: ${swapResult.transactionMessage}`;
      }
      if (swapResult.error) {
        errorMessage += `\nError Details: ${swapResult.error}`;
      }
      if (swapResult.signature && swapResult.signature !== "No signature") {
        errorMessage += `\nTransaction may still be processing.\nCheck signature [${swapResult.signature}](<https://solscan.io/tx/${swapResult.signature}>).`;
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
      errorMessage += `Error Details: ${error.message}\n`;
    }
    if (error.response) {
      errorMessage += `Response Status: ${error.response.status}\n`;
      errorMessage += `Response Data: ${JSON.stringify(error.response.data, null, 2)}\n`;
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
export async function executeSwap(
  userId: string,
  walletPublicKey: string,
  swapTransaction: string,
  originalSlippage: number,
  maxSlippage: number
) {
  const maxRetries = 5;
  const initialDelay = 1000; // 1 second
  let retryCount = 0;
  let delay = initialDelay;
  let slippage = originalSlippage;

  while (retryCount < maxRetries) {
    try {
      const response = await limiter.schedule({ id: `execute-swap-${userId}-${retryCount}` }, async () => {
        return axios.post(`${API_BASE_URL}/sign-and-send`, {
          userId,
          walletPublicKey,
          serializedTransaction: swapTransaction,
        });
      });

      if (response.status !== 200) {
        throw new Error(`Signer service returned status ${response.status}: ${JSON.stringify(response.data)}`);
      }
      
      const { signature } = response.data;

      return {
        success: true,
        signature,
        error: null,
        transactionMessage: signature ? 'Transaction submitted' : 'Transaction not submitted',
      };
    } catch (error: any) {
      console.error(`Swap execution failed (attempt ${retryCount + 1}):`, error.message || error);

      // Extract transaction message from the error
      let transactionMessage = '';

      if (error.response?.data?.transactionMessage) {
        transactionMessage = error.response.data.transactionMessage;
      } else if (error.transactionMessage) {
        transactionMessage = error.transactionMessage;
      } else if (error.message) {
        transactionMessage = error.message;
      }

      // Check if error is due to slippage tolerance exceeded
      const isSlippageError =
        transactionMessage &&
        (transactionMessage.includes('custom program error: 0x1771') ||
         transactionMessage.includes('Slippage tolerance exceeded'));

      if (isSlippageError) {
        console.log('Slippage tolerance exceeded. Adjusting slippage and retrying...');
        // Increase slippage and retry
        slippage = Math.min(slippage * 1.5, maxSlippage);
        if (slippage > maxSlippage) {
          // Exceeded maximum allowed slippage
          return {
            success: false,
            error: 'Slippage tolerance exceeded and maximum slippage reached.',
            transactionMessage: error.transactionMessage,
            signature: 'No signature',
          };
        }

        // Get a new swap transaction with increased slippage
        const newSettings = {
          ...settings,
          slippage: slippage,
        };

        const newSwapData = await getSwapTransaction(
          quoteData,
          walletPublicKey,
          newSettings
        );

        swapTransaction = newSwapData.swapTransaction;

        retryCount++;
        delay *= 2; // Exponential backoff
      } else if (error.response?.status === 429) {
        console.log(`Rate limit hit, retrying after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
        delay *= 2; // Exponential backoff
      } else {
        // For other errors, return immediately
        return {
          success: false,
          error: error.response?.data?.error || error.message || 'Unknown error',
          transactionMessage: error.response?.data?.transactionMessage || 'No additional information',
          signature: error.response?.data?.signature || 'No signature',
        };
      }
    }
  }

  // If the maximum retries are reached
  return {
    success: false,
    error: 'Max retries reached',
    transactionMessage: 'Failed to execute swap after multiple attempts.',
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
