import { CommandInteraction, MessageReaction, User } from 'discord.js';
import { getQuote, getSwapTransaction } from '../../src/services/jupiter.service';
import UserAccount from '../../src/models/User';
import Trade from '../../src/models/Trade';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { defaultSettings } from '../../src/components/BotSettings';
import dotenv from 'dotenv';
dotenv.config({ path: ['../../.env.local', '../../.env'] });
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const swapTime = 5000;
const ENTRY_SIZES = [0.05, 0.1, 0.25, 0.5, 1];
const REACTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];


export async function handleBuyCommand(interaction: CommandInteraction) {
  const tokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  try {
    const user = await UserAccount.findOne({ name: userId });

    if (!user || user.wallets.length === 0) {
      return interaction.reply({ content: 'You need to set up your wallet first.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: false });

    const wallet = user.wallets[0];
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address

    const entryAmounts = user.settings.entryAmounts || ENTRY_SIZES;
    const settings = user.settings || defaultSettings;
    const reactionEmojis = REACTION_EMOJIS.slice(0, entryAmounts.length);

    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    const balance = await connection.getBalance(new PublicKey(wallet.publicKey));

    const previewMessage = await interaction.editReply({
      content: `Select your entry size for buying ${tokenAddress}:\n` +
        entryAmounts.map((size, index) => {
          const amount = (balance * size) / 1e9;
          return `${reactionEmojis[index]}: ${size * 100} SOL`;
        }).join('\n') +
        '\nReact with 🚫 to cancel the transaction.',
      fetchReply: true
    });

    for (const emoji of [...reactionEmojis, '🚫']) {
      await previewMessage.react(emoji);
    }

    const filter = (reaction: MessageReaction, user: User) => 
      [...reactionEmojis, '🚫'].includes(reaction.emoji.name!) && user.id === userId;

    const collector = previewMessage.createReactionCollector({ filter, time: 60000 });

    collector.on('collect', async (reaction, user) => {
      collector.stop();
      if (reaction.emoji.name === '🚫') {
        await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
        return;
      }

      const sizeIndex = reactionEmojis.indexOf(reaction.emoji.name!);
      const entrySize = entryAmounts[sizeIndex];
      const amount = (entrySize) / 1e9; // Convert lamports to SOL

      const requiredBalance = amount * 1e9 + 5000000; // Add 0.005 SOL for transaction fees
      if (balance < requiredBalance) {
        await interaction.followUp({ content: `Insufficient balance. You need at least ${(requiredBalance / 1e9).toFixed(4)} SOL for this transaction.`, ephemeral: true });
        return;
      }

      try {
        const quoteData = await getQuote(
          inputToken,
          tokenAddress,
          amount * 1e9,
          settings.slippageType === 'fixed' 
            ? { type: 'fixed' as const, value: settings.slippage }
            : { type: 'dynamic' as const }
        );

        const estimatedOutput = quoteData.outAmount / 1e9; // Assuming output token has 9 decimals
        const swapPreview = `Swap Preview:
From: ${amount.toFixed(4)} SOL
To: ${estimatedOutput.toFixed(6)} ${tokenAddress}
Price Impact: ${(quoteData.priceImpactPct * 100).toFixed(2)}%
Slippage: ${settings.slippageType === 'fixed' ? `${settings.slippage/100}%` : 'Dynamic'}
Transaction Speed: ${settings.transactionSpeed}
Smart-MEV Protection: ${settings.smartMevProtection}
Wrap/Unwrap SOL: ${settings.wrapUnwrapSOL ? 'Enabled' : 'Disabled'}
React with 🗑️ within ${swapTime/1000} seconds to cancel the transaction.`;

        const swapPreviewMessage = await interaction.followUp({ content: swapPreview, fetchReply: true });
        await swapPreviewMessage.react('🗑️');

        const cancelFilter = (reaction: MessageReaction, user: User) => 
          reaction.emoji.name === '🗑️' && user.id === userId;

        const cancelCollector = swapPreviewMessage.createReactionCollector({ filter: cancelFilter, time: swapTime });

        cancelCollector.on('collect', async () => {
          cancelCollector.stop();
          await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
        });

        cancelCollector.on('end', async (collected) => {
          if (collected.size === 0) {
            try {
              const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);

              const response = await axios.post(`${API_BASE_URL}/sign-and-send`, {
                userId: userId,
                walletPublicKey: wallet.publicKey,
                serializedTransaction: swapData.swapTransaction,
              });

              const { signature } = response.data;

              await Trade.create({
                userId: userId,
                walletAddress: wallet.publicKey,
                txid: signature,
                amount,
                token: tokenAddress,
              });

              await interaction.followUp({ content: `Buy order executed successfully. Transaction ID: ${signature}`, ephemeral: true });
            } catch (error) {
              console.error('Buy execution failed:', error);
              await interaction.followUp({ content: 'Failed to execute buy order. Please try again later.', ephemeral: true });
            }
          }
        });
      } catch (error) {
        console.error('Error getting quote:', error);
        await interaction.followUp({ content: 'Failed to get quote. Please try again later.', ephemeral: true });
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.followUp({ content: 'Buy order timed out. Please try again.', ephemeral: true });
      }
    });

  } catch (error) {
    console.error('Error in handleBuyCommand:', error);
    interaction.followUp({ content: 'An error occurred while processing your buy order.', ephemeral: true });
  }
}
