import {
  CommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  userMention,
  TextChannel,
  InteractionCollector,
  ButtonInteraction,
} from 'discord.js';
import { getQuote, getSwapTransaction, getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import { signAndSendTransaction, confirmTransactionWithRetry, getAmountTransferredFromTransaction } from '../../src/services/signing.service';
import UserAccount from '../../src/models/User';
import Trade from '../../src/models/Trade';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionResponse, ParsedInstruction, Keypair, Commitment, TransactionExpiredBlockheightExceededError, LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';
import { defaultSettings, Settings } from '../../src/config/defaultSettings';
import { truncatedString, mapSelectionToUserSettings, formatNumber, getConnection, checkRPCHealth } from '../../src/lib/utils';
import pLimit from 'p-limit';
import limiter from '../../src/lib/limiter';
import '../../env.ts';
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import bs58 from 'bs58';
import { EventEmitter } from 'events';

const SOL_TRANSFER_FEE = 5000; // 0.000005 SOL for transaction fees
const API_BASE_URL = process.env.SIGNING_SERVICE_URL;
export const MIN_AMOUNT_LAMPORTS = 2500; // 0.0000025 SOL minimum
export const swapTime = 500; // Time to confirm the swap (in milliseconds)
const poolingWalletPrivateKey = process.env.POOLING_WALLET_PRIVATE_KEY;
if (!poolingWalletPrivateKey) {
  throw new Error('POOLING_WALLET_PRIVATE_KEY is not set in environment variables.');
}
const poolingWalletKeypair = Keypair.fromSecretKey(bs58.decode(poolingWalletPrivateKey));

function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

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
  ephemeral = false,
  testResponse: 'swap_now' | 'cancel_swap' | null = null // Add this parameter
): Promise<'swap_now' | 'cancel_swap' | 'timeout'> {
  return new Promise(async (resolve) => {
    if (testResponse) {
      // Immediately resolve with the test response
      return resolve(testResponse);
    }

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
        resolve('cancel_swap');
        return;
      }

      await interaction.editReply({
        content,
        components: [actionRow],
      });

      const filter = (i: any) =>
        i.user.id === interaction.user.id &&
        (i.customId === 'swap_now' || i.customId === 'cancel_swap');

      const collector = (interaction.channel as TextChannel).createMessageComponentCollector({
        filter,
        componentType: ComponentType.Button,
        time: swapTime + 2400, // add buffer
      });

      collector?.on('collect', async (i) => {
        await i.deferUpdate();
        collector.stop();
        resolve(i.customId as 'swap_now' | 'cancel_swap');
      });

      collector?.on('end', async (_collected: any, _reason: string) => {
        if (_reason === 'time') {
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
export async function executeSwapsForUsers(
  params: {
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
  },
  eventEmitter?: EventEmitter
): Promise<void> {
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
    channelId,
  } = params;

  try {
    // Get connection and verify health
    const connection = await getConnection();
    const isHealthy = await checkRPCHealth(connection);
    
    if (!isHealthy) {
      await interaction.editReply({
        content: 'RPC connection is currently unstable. Please try again in a few moments.',
        components: [],
      });
      return;
    }

    // Ensure connectedWallets includes the initiating user
    if (!connectedWallets.some(wallet => wallet.user.discordId === initiatingUser.discordId)) {
      connectedWallets.push({
        user: initiatingUser,
        wallet: {
          publicKey: initiatingUser.walletAddress,
          settings: initiatingUser.walletSettings,
        },
      });
    }

    // Proceed with calculating contributions
    const userContributions = await calculateUserContributions(
      connectedWallets,
      isBuyOperation,
      initiatingEntryAmounts ?? [],
      initiatingExitPercentages ?? [],
      selectionIndex,
      customAmount,
      customPercentage,
      inputTokenInfo,
      outputTokenInfo,
      interaction
    );

    console.log('User contributions:', userContributions);

    console.log('Calculating user contributions...');

    console.log('Funds transferred to pool');

    if (userContributions.length === 0) {
      await interaction.editReply({
        content: 'No users have sufficient balance to participate in the swap. Minimum amount required is ' + MIN_AMOUNT_LAMPORTS/LAMPORTS_PER_SOL + ' SOL.',
        components: [],
      });
      return;
    }

    // Step 2: Transfer funds from user wallets to pooling wallet
    await transferFundsToPool(userContributions, inputTokenAddress, poolingWalletKeypair.publicKey.toBase58(), inputTokenInfo);
    eventEmitter?.emit('transfersInitiated');

    // Step 3: Confirm transfers and filter out any failed transfers
    const confirmedContributions = await confirmAndFilterTransfers(connection as any, userContributions, poolingWalletKeypair.publicKey.toBase58());
    eventEmitter?.emit('transfersConfirmed');

    if (confirmedContributions.length === 0) {
      await interaction.editReply({
        content: 'Failed to collect funds from users for the swap.',
        components: [],
      });
      // Optionally, initiate refunds if any transfers succeeded
      return;
    }

    // Step 4: Execute pool swap
    const totalInputAmount = confirmedContributions.reduce((sum, uc) => sum + uc.contributionAmount, 0);
    
    console.log('Executing pool swap with params:', {
      totalInputAmount,
      inputTokenAddress,
      outputTokenAddress,
      initiatingSettings
    });

    try {
      const swapSignature = await executePoolSwap(
        totalInputAmount,
        inputTokenAddress,
        outputTokenAddress,
        initiatingSettings,
        poolingWalletKeypair.publicKey.toBase58()
      );
      eventEmitter?.emit('swapComplete');

      // Step 5: Confirm the swap transaction
      if (!swapSignature) {
        throw new Error('Swap signature is null');
      }
      await confirmTransactionWithRetry(connection, swapSignature);

      // Step 6: Get total output amount from the swap transaction
      const swapTransactionInfo = await getTransactionInfo(swapSignature);
      const totalOutputAmount = await extractOutputAmountFromTransaction(swapTransactionInfo, outputTokenAddress);

      // If totalOutputAmount is zero or undefined, the swap may have failed
      if (!totalOutputAmount || totalOutputAmount <= 0) {
        throw new Error('Swap transaction failed or resulted in zero output.');
      }

      try {
        // Proceed to distribute tokens back to users
        await distributeTokensToUsers(confirmedContributions, totalInputAmount, totalOutputAmount, outputTokenAddress);
      } catch (error) {
        console.error('Error in token distribution:', error);
        if (eventEmitter) {
          eventEmitter.emit('executeSwapsForUsersCompleted');
        }
        throw error;
      }

      // Emit completion after successful distribution
      if (eventEmitter) {
        eventEmitter.emit('executeSwapsForUsersCompleted');
      }

    } catch (swapError) {
      console.error('Swap transaction failed:', swapError);

      // Refund users their contributions
      await refundContributions(confirmedContributions, inputTokenAddress);

      await interaction.editReply({
        content: 'Swap transaction failed. Contributions have been refunded to users.',
        components: [],
      });

      if (eventEmitter) {
        eventEmitter.emit('executeSwapsForUsersCompleted');
      }
      return;
    }

    // Step 9: Send public message about the swap
    const successfulSwaps = confirmedContributions.map((contribution) => ({
      user: { discordId: contribution.userId },
      wallet: { publicKey: contribution.walletAddress },
    }));

    const selectionLabel = getSelectionLabel(
      isBuyOperation,
      selectionIndex,
      customAmount,
      customPercentage,
      initiatingEntryAmounts!,
      initiatingExitPercentages!
    );

    if (interaction.channel) {
      const publicMessage = `${userMention(initiatingUser.discordId)} ${
        isBuyOperation ? 'bought' : 'sold'
      } a **${selectionLabel}** amount of **[${isBuyOperation ? outputTokenInfo.symbol : inputTokenInfo.symbol}](<https://solscan.io/token/${
        isBuyOperation ? outputTokenAddress : inputTokenAddress
      }>)**.${
        successfulSwaps.length > 1
          ? `\n${successfulSwaps.length - 1} follower${successfulSwaps.length > 2 ? 's' : ''} also executed the swap.`
          : ''
      }`;

      // Use interaction.followUp instead of channel.send
      await interaction.followUp({
        content: publicMessage,
        ephemeral: false
      });
    }
  } catch (error) {
    console.error('Error in executeSwapsForUsers:', error);
    if (eventEmitter) {
      eventEmitter.emit('executeSwapsForUsersCompleted');
    }
    throw error;
  }
}

// Helper function to notify the user about insufficient balance
async function notifyUserInsufficientBalance(
  userId: string,
  walletPublicKey: string,
  tokenSymbol: string,
  interaction: CommandInteraction,
  minAmount: number
) {
  const truncatedWallet = truncatedString(walletPublicKey, 4);
  const message = `Your wallet [${truncatedWallet}](<https://solscan.io/account/${walletPublicKey}>) does not meet the minimum amount requirement for ${tokenSymbol}. Minimum required: ${minAmount/LAMPORTS_PER_SOL} ${tokenSymbol}`;

  try {
    if (userId === interaction.user.id) {
      await interaction.followUp({
        content: message,
        ephemeral: true,
      });
    } else {
      const userDiscord = await interaction.client.users.fetch(userId);
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
From: ${formatNumber(amountHuman)} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputToken}>)
To: ${formatNumber(estimatedOutput)} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputToken}>)
Price Impact: ${formatNumber(Number(quoteData.priceImpactPct) * 100, 2)}%
Slippage: ${
      settings.slippageType === 'fixed'
        ? `${formatNumber(settings.slippage ? settings.slippage / 100 : 0, 2)}%`
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
        ? `Bought **${formatNumber(estimatedOutput)} ${outputTokenInfo.symbol}** with **${formatNumber(selectedAmount / 10 ** inputTokenInfo.decimals)} ${inputTokenInfo.symbol}**\n`
        : `Sold **${formatNumber(selectedAmount / 10 ** inputTokenInfo.decimals)} ${inputTokenInfo.symbol}** for **${formatNumber(estimatedOutput)} ${outputTokenInfo.symbol}**\n`;

      const balanceContent = `New Balances:\n- ${inputTokenInfo.symbol}: ${formatNumber(inputBalanceAfter / 10 ** inputTokenInfo.decimals)}\n- ${outputTokenInfo.symbol}: ${formatNumber(outputBalanceAfter / 10 ** outputTokenInfo.decimals)}`;

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
      let errorMessage = `Failed to ${isBuyOperation ? 'buy' : 'sell'} ${selectedAmount / 10 ** inputTokenInfo.decimals} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>) for ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>) on wallet [${truncatedWallet}](<https://solscan.io/account/${wallet.publicKey}>).`;
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
  const initialDelay = 500; // Reduced from 1000 to 500ms
  let retryCount = 0;
  let delay = initialDelay;

  while (retryCount < maxRetries) {
    try {
      const uniqueJobId = `execute-swap-${userId}-${retryCount}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const response = await limiter.schedule({ id: uniqueJobId }, async () => {
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
      const connection = await getConnection();

      try {
        await confirmTransactionWithRetry(connection, signature, 'confirmed', 20, 500);
        return {
          success: true,
          signature,
          error: null,
          transactionMessage: 'Transaction submitted and confirmed'
        };
      } catch (error: any) {
        if (error?.message?.includes('block height exceeded')) {
          console.log('Transaction expired, retrying...');
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 1.5; // Exponential backoff
          continue;
        }
        throw error;
      }
    } catch (error: any) {
      console.error(`Swap execution failed (attempt ${retryCount + 1}):`, error.message || error);
      retryCount++;
      if (retryCount >= maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 1.5;
    }
  }
  throw new Error(`Failed to execute swap after ${maxRetries} attempts`);
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

function calculateScaledAmount(customAmount: number, initiatingEntryAmounts: number[], userEntryAmounts: number[]): number {
  // Calculate the ratio of the custom amount to the initiating user's entry amounts
  const initiatingMin = Math.min(...initiatingEntryAmounts);
  const initiatingMax = Math.max(...initiatingEntryAmounts);
  const ratio = (customAmount - initiatingMin) / (initiatingMax - initiatingMin);

  // Apply the ratio to the following user's entry amounts
  const userMin = Math.min(...userEntryAmounts);
  const userMax = Math.max(...userEntryAmounts);
  const scaledAmount = userMin + ratio * (userMax - userMin);

  // Ensure the scaled amount is within the user's entry amounts range
  if (scaledAmount < userMin || scaledAmount > userMax) {
    throw new Error('Calculated amount is out of the user\'s entry amounts range.');
  }

  return scaledAmount;
}

function calculateScaledPercentage(customPercentage: number, initiatingExitPercentages: number[], userExitPercentages: number[]): number {
  const initiatingMin = Math.min(...initiatingExitPercentages);
  const initiatingMax = Math.max(...initiatingExitPercentages);
  const ratio = (customPercentage - initiatingMin) / (initiatingMax - initiatingMin);

  const userMin = Math.min(...userExitPercentages);
  const userMax = Math.max(...userExitPercentages);
  const scaledPercentage = userMin + ratio * (userMax - userMin);

  if (scaledPercentage < userMin || scaledPercentage > userMax) {
    throw new Error('Calculated percentage is out of the user\'s exit percentages range.');
  }

  return scaledPercentage;
}

// New function to calculate user contributions
interface UserContribution {
  userId: string;
  walletAddress: string;
  contributionAmount: number;
  transferSignature?: string;
  error?: string;
  tokenAddress: string;  // Add this field
}

async function calculateUserContributions(
  connectedWallets: any[],
  isBuyOperation: boolean,
  initiatingEntryAmounts: number[],
  initiatingExitPercentages: number[],
  selectionIndex: number | 'Custom',
  customAmount: number | undefined,
  customPercentage: number | undefined,
  inputTokenInfo: any,
  outputTokenInfo: any,
  interaction: CommandInteraction
): Promise<UserContribution[]> {
  console.log('Calculating user contributions:', { 
    connectedWallets, 
    initiatingEntryAmounts, 
    selectionIndex 
  });
  
  const userContributions: UserContribution[] = [];
  const insufficientUsers: { userId: string; walletAddress: string }[] = [];

  for (const walletInfo of connectedWallets) {
    const { user, wallet } = walletInfo;
    const walletPublicKey = wallet.publicKey;

    if (!walletPublicKey) {
      console.error(`User ${user.discordId} does not have a valid wallet address.`);
      continue;
    }

    // Get token balance
    const { balance: walletBalance } = await getTokenBalance(walletPublicKey, inputTokenInfo.address);

    // Calculate contribution amount based on operation type
    let contributionAmount: number;
    if (isBuyOperation) {
      const userSettings = user.settings || defaultSettings;
      const userAmountSOL = mapSelectionToUserSettings(
        userSettings.entryAmounts || defaultSettings.entryAmounts,
        selectionIndex as number
      );
      contributionAmount = Math.floor(userAmountSOL * LAMPORTS_PER_SOL);
    } else {
      // Sell operation
      const percentage = selectionIndex === 'Custom' 
        ? customPercentage 
        : initiatingExitPercentages[selectionIndex as number];
      
      if (typeof percentage !== 'number') {
        console.error(`Invalid percentage for user ${user.discordId}`);
        continue;
      }

      contributionAmount = Math.floor((percentage / 100) * walletBalance);
    }

    // Validate contribution amount
    if (contributionAmount < MIN_AMOUNT_LAMPORTS) {
      console.log(`User ${user.discordId} contribution (${contributionAmount}) is below minimum (${MIN_AMOUNT_LAMPORTS})`);
      insufficientUsers.push({
        userId: user.discordId,
        walletAddress: walletPublicKey
      });
      continue;
    }

    if (contributionAmount <= 0 || walletBalance < contributionAmount) {
      console.log(`User ${user.discordId} has insufficient balance for contribution.`);
      continue;
    }

    userContributions.push({
      userId: user.discordId,
      walletAddress: walletPublicKey,
      contributionAmount,
      tokenAddress: inputTokenInfo.address
    });
  }

  // Notify insufficient users
  for (const user of insufficientUsers) {
    await notifyUserInsufficientBalance(
      user.userId,
      user.walletAddress,
      inputTokenInfo.symbol,
      interaction,
      MIN_AMOUNT_LAMPORTS
    );
  }

  return userContributions;
}

const processedTransactions = new Set<string>();

async function transferFundsToPool(
  userContributions: UserContribution[],
  inputTokenAddress: string,
  poolingWalletAddress: string,
  inputTokenInfo: any
): Promise<void> {
  const connection = await getConnection();

  const processedTransactions = new Set<string>();

  await Promise.all(
    userContributions.map(async (contribution) => {
      const { userId, walletAddress, contributionAmount } = contribution;

      // Create a unique key for this transfer
      const transferKey = `${walletAddress}-${contributionAmount}-${Date.now()}`;

      // Skip if already processed
      if (processedTransactions.has(transferKey)) {
        console.log(`Skipping duplicate transfer for user ${userId}`);
        return;
      }

      try {
        if (!isValidPublicKey(walletAddress) || !isValidPublicKey(poolingWalletAddress)) {
          throw new Error('Invalid wallet address');
        }

        if (!isValidPublicKey(inputTokenAddress)) {
          throw new Error('Invalid token address');
        }

        const isNativeSOL = inputTokenAddress === 'So11111111111111111111111111111111111111112';
        const userPubkey = new PublicKey(walletAddress);
        const poolPubkey = new PublicKey(poolingWalletAddress);

        // Ensure contributionAmount is an integer
        const lamports = Math.floor(contributionAmount);

        // Check balances and create transfer instructions based on token type
        let transaction: Transaction;

        if (isNativeSOL) {
          // For SOL transfers
          const userBalance = await connection.getBalance(userPubkey);

          // Estimate transaction fee
          const estimatedFee = 5000; // Adjust as needed

          if (userBalance < lamports + estimatedFee) {
            console.error(
              `Insufficient SOL balance for user ${userId}. Has ${userBalance}, needs at least ${
                lamports + estimatedFee
              }`
            );
            contribution.error = 'Insufficient SOL balance';
            return;
          }

          // Create transaction
          transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: userPubkey,
              toPubkey: poolPubkey,
              lamports,
            })
          );
        } else {
          // For SPL Token transfers
          // Get user's token balance
          const { balance: tokenBalance } = await getTokenBalance(walletAddress, inputTokenAddress);

          if (tokenBalance < lamports) {
            console.error(
              `Insufficient token balance for user ${userId}. Has ${tokenBalance}, needs at least ${lamports}`
            );
            contribution.error = 'Insufficient token balance';
            return;
          }

          // Ensure the user has enough SOL to cover fees (assuming ~0.001 SOL per transaction)
          const userSOLBalance = await connection.getBalance(userPubkey);
          const estimatedFee = 10000; // Adjust as needed

          if (userSOLBalance < estimatedFee) {
            console.error(
              `Insufficient SOL for transaction fees for user ${userId}. Has ${userSOLBalance}, needs at least ${estimatedFee}`
            );
            contribution.error = 'Insufficient SOL for fees';
            return;
          }

          // Ensure token account exists for the pooling wallet
          const sourceTokenAccount = await getAssociatedTokenAddress(
            new PublicKey(inputTokenAddress),
            userPubkey
          );
          const destinationTokenAccount = await getAssociatedTokenAddress(
            new PublicKey(inputTokenAddress),
            poolPubkey
          );

          // Add SOL transfer instruction for fees
          const solForFeesInstruction = SystemProgram.transfer({
            fromPubkey: userPubkey,
            toPubkey: poolPubkey,
            lamports: SOL_TRANSFER_FEE
          });

          // Add both instructions to the transaction
          transaction = new Transaction()
            .add(solForFeesInstruction)
            .add(createTransferCheckedInstruction(
              sourceTokenAccount,
              new PublicKey(inputTokenAddress),
              destinationTokenAccount,
              userPubkey,
              lamports,
              inputTokenInfo.decimals
            ));
        }

        // Set recent blockhash and fee payer
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = userPubkey;

        const serializedTransaction = transaction
          .serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          })
          .toString('base64');

        // Send to signing service
        const response = await axios.post(`${API_BASE_URL}/sign-and-send`, {
          userId,
          walletPublicKey: walletAddress,
          serializedTransaction,
        });

        if (response.status === 200) {
          console.log(`Transfer initiated for user ${userId}`);
          contribution.transferSignature = response.data.signature;
          processedTransactions.add(transferKey);
        }
      } catch (error: any) {
        console.error(`Transfer failed for user ${userId}:`, error);
        contribution.error = error.message || 'Unknown error';
      }
    })
  );
}


async function confirmAndFilterTransfers(
  connection: Connection,
  userContributions: UserContribution[],
  poolingWalletAddress: string
): Promise<UserContribution[]> {
  const confirmedContributions: UserContribution[] = [];
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (const contribution of userContributions) {
    let retryCount = 0;
    let confirmed = false;

    while (retryCount < maxRetries && !confirmed) {
      try {
        if (!contribution.transferSignature) {
          console.error(`No transfer signature for user ${contribution.userId}`);
          break;
        }

        const txid = contribution.transferSignature;
        console.log(`Attempting to confirm transaction ${txid} for user ${contribution.userId} (attempt ${retryCount + 1})`);
        
        const txInfo = await connection.getTransaction(txid, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });

        if (!txInfo) {
          console.log(`Transaction not found, retrying in ${retryDelay}ms...`);
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          break;
        }

        const amountTransferred = getAmountTransferredFromTransaction(
          txInfo as any,
          contribution.walletAddress,
          poolingWalletAddress,
          contribution.tokenAddress,
          contribution.contributionAmount
        );

        if (amountTransferred >= contribution.contributionAmount) {
          confirmedContributions.push(contribution);
          confirmed = true;
        } else {
          console.error(`Transfer amount mismatch for user ${contribution.userId}`);
          break;
        }
      } catch (error) {
        console.error(`Error confirming transfer for user ${contribution.userId}:`, error);
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  return confirmedContributions;
}

export async function executePoolSwap(
  totalInputAmount: number,
  inputTokenAddress: string,
  outputTokenAddress: string,
  settings: Settings,
  poolingWalletAddress: string // Add this parameter
) {
  const connection = await getConnection();
  
  // Verify pool wallet has received the funds
  const { balance: poolBalance } = await getTokenBalance(
    poolingWalletAddress,
    inputTokenAddress
  );

  if (poolBalance < totalInputAmount) {
    throw new Error(`Pool wallet balance (${poolBalance}) is less than required amount (${totalInputAmount})`);
  }

  const maxRetries = 3;
  let attempt = 0;
  let lastSignature: string | null = null;
  const MIN_AMOUNT_LAMPORTS = 2500; // 0.0000025 SOL minimum

  if (totalInputAmount < MIN_AMOUNT_LAMPORTS) {
    throw new Error(`Amount too small. Minimum amount is ${MIN_AMOUNT_LAMPORTS} lamports`);
  }

  while (attempt < maxRetries) {
    try {
      // Check previous signature if exists
      if (lastSignature) {
        const connection = await getConnection();
        try {
          const status = await connection.getSignatureStatus(lastSignature);
          if (status?.value?.confirmationStatus === 'confirmed') {
            return lastSignature;
          }
        } catch (error) {
          console.log('Previous transaction definitely failed, proceeding with retry');
        }
      }

      // Try different route types if one fails
      const routeTypes = ['JUPITER_V6', 'RAYDIUM_V4', 'ORCA_WHIRLPOOL'];
      let quoteData;
      let lastQuoteError;

      for (const routeType of routeTypes) {
        try {
          quoteData = await getQuote(
            inputTokenAddress,
            outputTokenAddress,
            totalInputAmount,
            settings.slippageType === 'fixed'
              ? { type: 'fixed', value: settings.slippage * 2 } // Double slippage for pool swaps
              : { type: 'dynamic', value: settings.slippage * 2 }
          );
          if (quoteData && quoteData.outAmount) break;
        } catch (error) {
          console.log(`Quote attempt with ${routeType} failed:`, error);
          lastQuoteError = error;
          continue;
        }
      }

      if (!quoteData || !quoteData.outAmount) {
        throw lastQuoteError || new Error('Failed to get swap quote');
      }

      const swapData = await getSwapTransaction(
        quoteData,
        poolingWalletKeypair.publicKey.toBase58(),
        {
          ...settings,
          slippageType: 'dynamic',  // Force dynamic slippage for pool swaps
          slippage: settings.slippage * 4  // Increase multiplier from 2 to 4
        }
      );

      const uniqueJobId = `pool-swap-${attempt}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const response = await limiter.schedule({ id: uniqueJobId }, async () => {
        return axios.post(`${API_BASE_URL}/sign-and-send-pooling-wallet`, {
          serializedTransaction: swapData.swapTransaction,
          priority: 'high'
        });
      });

      if (response.status === 200) {
        lastSignature = response.data.signature;
        
        const connection = await getConnection();
        try {
          if (!lastSignature) throw new Error('No transaction signature found');
          await confirmTransactionWithRetry(connection, lastSignature, 'confirmed', 10, 1000);
          return lastSignature;
        } catch (confirmError: any) {
          if (confirmError?.message?.includes('block height exceeded')) {
            attempt++;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
          throw confirmError;
        }
      }
    } catch (error: any) {
      console.error(`Pool swap attempt ${attempt + 1} failed:`, error);
      
      if (error.message?.includes('block height exceeded') && attempt < maxRetries - 1) {
        attempt++;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      
      if (attempt < maxRetries - 1) {
        attempt++;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error(`Failed to execute pool swap after ${maxRetries} attempts`);
}

async function distributeTokensToUsers(
  contributions: UserContribution[],
  totalInputAmount: number,
  totalOutputAmount: number,
  outputTokenAddress: string
): Promise<void> {
  const connection = await getConnection();

  for (const contribution of contributions) {
    const { userId, walletAddress, contributionAmount } = contribution;
    try {
      const isNativeSOL = outputTokenAddress === 'So11111111111111111111111111111111111111112';
      const userShare = (contributionAmount / totalInputAmount) * totalOutputAmount;
      const adjustedAmount = Math.floor(userShare);

      if (isNativeSOL) {
        // Calculate amount after reserving fees
        const feeAdjustedAmount = adjustedAmount - SOL_TRANSFER_FEE;
        
        // Check if pooling wallet has enough SOL
        const poolBalance = await connection.getBalance(poolingWalletKeypair.publicKey);
        if (poolBalance < feeAdjustedAmount) {
          throw new Error(`Insufficient SOL balance in pooling wallet: ${poolBalance} < ${feeAdjustedAmount}`);
        }

        const transferInstruction = SystemProgram.transfer({
          fromPubkey: poolingWalletKeypair.publicKey,
          toPubkey: new PublicKey(walletAddress),
          lamports: feeAdjustedAmount,
        });

        const transaction = new Transaction().add(transferInstruction);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = poolingWalletKeypair.publicKey;

        transaction.sign(poolingWalletKeypair);
        const serializedTransaction = transaction.serialize();
        const signature = await connection.sendRawTransaction(serializedTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });

        await confirmTransactionWithRetry(connection, signature);
      } else {
        // For SPL tokens, ensure destination account exists first
        const destinationTokenAccount = await ensureTokenAccountExists(
          walletAddress,
          outputTokenAddress,
          userId,
          true // isReceiving = true to create account if needed
        );

        const sourceTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(outputTokenAddress),
          poolingWalletKeypair.publicKey
        );

        const outputTokenInfo = await getTokenInfo(outputTokenAddress);
        const transferInstruction = createTransferCheckedInstruction(
          sourceTokenAccount,
          new PublicKey(outputTokenAddress),
          destinationTokenAccount,
          poolingWalletKeypair.publicKey,
          adjustedAmount,
          outputTokenInfo.decimals
        );

        const transaction = new Transaction().add(transferInstruction);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = poolingWalletKeypair.publicKey;

        transaction.sign(poolingWalletKeypair);
        const serializedTransaction = transaction.serialize();
        const signature = await connection.sendRawTransaction(serializedTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });

        await confirmTransactionWithRetry(connection, signature);
      }

      console.log(`Distributed tokens to user ${userId}`);
    } catch (error) {
      console.error(`Error distributing tokens to user ${userId}:`, error);
    }
  }
}

async function ensureTokenAccountExists(
  walletAddress: string,
  tokenMintAddress: string,
  userId: string,
  isReceiving: boolean = false
): Promise<PublicKey> {
  const connection = await getConnection();
  const tokenAccount = await getAssociatedTokenAddress(
    new PublicKey(tokenMintAddress),
    new PublicKey(walletAddress)
  );

  // If not receiving tokens, just return the token account address
  if (!isReceiving) {
    return tokenAccount;
  }

  try {
    const accountInfo = await connection.getAccountInfo(tokenAccount);

    if (accountInfo) {
      console.log(`Token account already exists for wallet ${walletAddress} and token ${tokenMintAddress}`);
      return tokenAccount;
    }

    // Handle WSOL differently
    if (tokenMintAddress === 'So11111111111111111111111111111111111111112') {
      return new PublicKey(walletAddress);
    }

    // Create token account only when receiving tokens
    console.log(`Creating token account for wallet ${walletAddress} and token ${tokenMintAddress}`);
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        new PublicKey(walletAddress),
        tokenAccount,
        new PublicKey(walletAddress),
        new PublicKey(tokenMintAddress)
      )
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = new PublicKey(walletAddress);

    const serializedTransaction = transaction
      .serialize({ verifySignatures: false })
      .toString('base64');

    const response = await axios.post(`${API_BASE_URL}/sign-and-send`, {
      userId,
      walletPublicKey: walletAddress,
      serializedTransaction,
    });

    if (response.status !== 200) {
      throw new Error(`Failed to create token account: ${response.data.error || 'Unknown error'}`);
    }

    await confirmTransactionWithRetry(connection, response.data.signature);
    return tokenAccount;
  } catch (error: any) {
    console.error(`Error ensuring token account for wallet ${walletAddress} and token ${tokenMintAddress}:`, error);
    throw new Error(`Failed to ensure token account: ${error.message || 'Unknown error'}`);
  }
}


async function getTransactionInfo(signature: string): Promise<TransactionResponse | null> {
  const connection = await getConnection();
  try {
    const transactionInfo = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    return transactionInfo as TransactionResponse | null;
  } catch (error) {
    console.error(`Error fetching transaction info for signature ${signature}:`, error);
    return null;
  }
}

async function extractOutputAmountFromTransaction(transactionInfo: any, outputTokenAddress: string): Promise<number> {
  try {
    // For Jupiter swaps, look for postTokenBalances
    if (transactionInfo?.meta?.postTokenBalances) {
      const poolingWalletBalance = transactionInfo.meta.postTokenBalances.find(
        (balance: any) => 
          balance.owner === poolingWalletKeypair.publicKey.toBase58() &&
          balance.mint === outputTokenAddress
      );

      if (poolingWalletBalance) {
        return Number(poolingWalletBalance.uiTokenAmount.amount);
      }
    }
    
    // Also check postBalances for native SOL
    if (outputTokenAddress === 'So11111111111111111111111111111111111111112' && transactionInfo?.meta?.postBalances) {
      // Use accountKeys from meta instead of transaction.message
      const accountKeys = transactionInfo.transaction?.accountKeys || transactionInfo.meta.postTokenBalances?.map((b: any) => b.owner) || [];
      const poolingWalletIndex = accountKeys.findIndex(
        (key: any) => key === poolingWalletKeypair.publicKey.toBase58()
      );
      
      if (poolingWalletIndex !== -1) {
        return transactionInfo.meta.postBalances[poolingWalletIndex];
      }
    }

    console.log('Transaction info for debugging:', JSON.stringify(transactionInfo, null, 2));
    return 0;
  } catch (error) {
    console.error('Error extracting output amount:', error);
    return 0;
  }
}

async function refundContributions(
  contributions: UserContribution[],
  inputTokenAddress: string
): Promise<void> {
  const connection = await getConnection();
// Add at the start of refundContributions
  console.log('Starting refunds:', contributions.map(c => ({
    userId: c.userId,
    amount: c.contributionAmount,
    token: inputTokenAddress
  })));
  for (const contribution of contributions) {
    const { userId, walletAddress, contributionAmount, transferSignature } = contribution;
    
    // Verify this was actually received from this user
    if (transferSignature) {
      const txInfo = await connection.getTransaction(transferSignature);
      if (!txInfo || 
          !getAmountTransferredFromTransaction(
            txInfo as any,
            walletAddress,
            poolingWalletKeypair.publicKey.toBase58(),
            inputTokenAddress,
            contributionAmount
          )) {
        console.error(`Cannot verify original transfer from user ${userId}`);
        continue;
      }
    }

    try {
      const isNativeSOL = inputTokenAddress === 'So11111111111111111111111111111111111111112';

      if (isNativeSOL) {
        // Transfer SOL back using SystemProgram.transfer
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: poolingWalletKeypair.publicKey,
          toPubkey: new PublicKey(walletAddress),
          lamports: contributionAmount,
        });

        const transaction = new Transaction().add(transferInstruction);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = poolingWalletKeypair.publicKey;

        transaction.sign(poolingWalletKeypair);

        const serializedTransaction = transaction.serialize();
        const signature = await connection.sendRawTransaction(serializedTransaction);

        await confirmTransactionWithRetry(connection, signature);

        console.log(`Refunded contribution to user ${userId}`);
      } else {
        // Handle SPL Token refund
        const { userId, walletAddress, contributionAmount } = contribution;

        // Ensure token accounts exist
        await ensureTokenAccountExists(poolingWalletKeypair.publicKey.toBase58(), inputTokenAddress, userId, true);
        await ensureTokenAccountExists(walletAddress, inputTokenAddress, userId, true);
    
        // Create the transfer instruction for SPL tokens
        const sourceTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(inputTokenAddress),
          poolingWalletKeypair.publicKey
        );
        const destinationTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(inputTokenAddress),
          new PublicKey(walletAddress)
        );
    
        const inputTokenInfo = await getTokenInfo(inputTokenAddress);
        
        const transferInstruction = createTransferCheckedInstruction(
          sourceTokenAccount,
          new PublicKey(inputTokenAddress),
          destinationTokenAccount,
          poolingWalletKeypair.publicKey,
          contributionAmount,
          inputTokenInfo.decimals // Ensure inputTokenInfo is available
        );
    
        // Create the transaction
        const transaction = new Transaction().add(transferInstruction);
    
        // **Set the recent blockhash and fee payer**
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = poolingWalletKeypair.publicKey;
    
        // Serialize the transaction
        const serializedTransaction = transaction
          .serialize({ verifySignatures: false })
          .toString('base64');
    
        // Send transaction to signing service
        const response = await axios.post(`${API_BASE_URL}/sign-and-send-pooling-wallet`, {
          serializedTransaction,
        });
    
        if (response.status !== 200) {
          console.error(`Failed to refund user ${userId} for wallet ${walletAddress}: ${response.data.error}`);
          // Optionally notify the user about the failed refund
        } else {
          const { signature } = response.data;
          // Optionally confirm the refund transaction
          await confirmTransactionWithRetry(connection, signature);
        }
      }
    } catch (error) {
      console.error(`Error refunding contribution to user ${userId}:`, error);
    }
  }
}

function getSelectionLabel(
  isBuyOperation: boolean,
  selectionIndex: number | 'Custom',
  customAmount: number | undefined,
  customPercentage: number | undefined,
  initiatingEntryAmounts: number[],
  initiatingExitPercentages: number[]
): string {
  const selectionLabels = isBuyOperation
    ? ['small 🤏', 'medium ✊', 'Large 🤲', 'Very Large 🙌', 'Massive 🦍', 'MEGAMOON 🌝']
    : ['small 🤏', 'medium ✊', 'Large 🤲', 'Very Large 🙌'];

  let selectionLabel = 'Custom';

  if (selectionIndex !== 'Custom') {
    selectionLabel = selectionLabels[selectionIndex as number] || 'Custom';
  } else if (isBuyOperation && customAmount !== undefined) {
    const initiatingMin = Math.min(...initiatingEntryAmounts);
    const initiatingMax = Math.max(...initiatingEntryAmounts);

    if (customAmount < initiatingMin) {
      selectionLabel = `nano ${selectionLabels[0]}`;
    } else if (customAmount > initiatingMax) {
      selectionLabel = `SUPER ${selectionLabels[selectionLabels.length - 1]}`;
    } else {
      // Determine where the custom amount falls within the ranges
      for (let i = 0; i < initiatingEntryAmounts.length - 1; i++) {
        if (customAmount >= initiatingEntryAmounts[i] && customAmount < initiatingEntryAmounts[i + 1]) {
          selectionLabel = `between ${selectionLabels[i]} and ${selectionLabels[i + 1]}`;
          break;
        }
      }
    }
  } else if (!isBuyOperation && customPercentage !== undefined) {
    const initiatingMin = Math.min(...initiatingExitPercentages);
    const initiatingMax = Math.max(...initiatingExitPercentages);

    if (customPercentage < initiatingMin) {
      selectionLabel = `below ${selectionLabels[0]}`;
    } else if (customPercentage === 100) {
      selectionLabel = `full and final`;
    } else if (customPercentage > initiatingMax) {
      selectionLabel = `SUPER ${selectionLabels[selectionLabels.length - 1]}`;
    } else {
      // Determine where the custom percentage falls within the ranges
      for (let i = 0; i < initiatingExitPercentages.length - 1; i++) {
        if (customPercentage >= initiatingExitPercentages[i] && customPercentage < initiatingExitPercentages[i + 1]) {
          selectionLabel = `between ${selectionLabels[i]} and ${selectionLabels[i + 1]}`;
          break;
        }
      }
    }
  }

  return selectionLabel;
}

async function getTokenAccount(walletAddress: string, tokenMintAddress: string) {
  const connection = await getConnection();
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    Keypair.fromSecretKey(Buffer.from(walletAddress, 'base64')), // Convert base64 string to Keypair
    new PublicKey(tokenMintAddress),
    new PublicKey(walletAddress)
  );
  return tokenAccount.address;
}

























































































