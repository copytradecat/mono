import { MessageReaction, User as DiscordUser } from 'discord.js';
import { getQuote, getSwapTransaction } from '../../src/services/jupiter.service';
import User from '../../src/models/User';
import Trade from '../../src/models/Trade';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: ['../../.env.local', '../../.env'] });
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function handleTradeCommand(interaction: any, args: string[]) {
  if (args.length < 2) {
    return interaction.reply('Usage: /ct trade <amount> <token>');
  }

  const amount = parseFloat(args[0]);
  const token = args[1].toUpperCase();
  const userId = interaction.user?.id || interaction.author.id;

  try {
    const user = await User.findOne({ discordId: userId });

    if (!user || user.wallets.length === 0) {
      return interaction.reply('You need to set up your wallet first.');
    }

    await interaction.deferReply({ ephemeral: false });

    const wallet = user.wallets[0]; // Assuming the first wallet is the default

    const quoteData = await getQuote(
      'So11111111111111111111111111111111111111112', // SOL mint address
      token === 'SOL'
        ? 'So11111111111111111111111111111111111111112'
        : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint address
      amount * 1e9,
      user.settings.slippageType === 'fixed' 
        ? { type: 'fixed' as const, value: user.settings.slippage }
        : { type: 'dynamic' as const }
    );

    const swapData = await getSwapTransaction(quoteData, wallet.publicKey, user.settings);

    // Construct the swap preview message
    const estimatedOutput = quoteData.outAmount / (token === 'USDC' ? 1e6 : 1e9);
    const swapPreview = `Swap Preview:
From: ${amount} SOL
To: ${estimatedOutput.toFixed(6)} ${token}
Price Impact: ${(quoteData.priceImpactPct * 100).toFixed(2)}%
Slippage: ${user.settings.slippageType === 'fixed' ? `${user.settings.slippage/100}%` : 'Dynamic'}
Transaction Speed: ${user.settings.transactionSpeed}
Smart-MEV Protection: ${user.settings.smartMevProtection}
Wrap/Unwrap SOL: ${user.settings.wrapUnwrapSOL ? 'Enabled' : 'Disabled'}
React with 🗑️ within 30 seconds to cancel the transaction.`;

    // Send the swap preview message and add trashcan reaction
    const previewMessage = await interaction.editReply({ content: swapPreview, fetchReply: true });

    // Add trashcan emoji reaction to the message
    await previewMessage.react('🗑️');

    // Set up reaction collector
    const filter = (reaction: MessageReaction, user: DiscordUser) => {
      return reaction.emoji.name === '🗑️' && user.id === userId;
    };

    const collector = previewMessage.createReactionCollector({ filter, time: 30000 });

    let transactionCancelled = false;

    collector.on('collect', async (reaction, user) => {
      transactionCancelled = true;
      collector.stop();
      await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
    });

    collector.on('end', async collected => {
      if (transactionCancelled) {
        // Transaction was cancelled, do nothing
      } else {
        // Proceed to execute the trade
        try {
          // Send the transaction to the signing server
          const response = await axios.post(`${API_BASE_URL}/api/sign-and-send`, {
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
            token,
          });

          await interaction.followUp({ content: `Trade executed successfully. Transaction ID: ${signature}`, ephemeral: true });
        } catch (error) {
          console.error('Trade execution failed:', error);
          await interaction.followUp({ content: 'Failed to execute trade. Please try again later.', ephemeral: true });
        }
      }
    });

  } catch (error) {
    console.error('Error in handleTradeCommand:', error);
    interaction.reply({ content: 'An error occurred while processing your trade.', ephemeral: true });
  }
}
