import { CommandInteraction, MessageReaction, User } from 'discord.js';
import { getUser, getBalance, createSwapPreview, executeSwap, recordTrade, createMessageCollector } from './swap-base';
import { getSwapTransaction, getTokenInfo } from '../../src/services/jupiter.service';

const ENTRY_SIZES = [0.05, 0.1, 0.25, 0.5, 1];
const REACTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
const swapTime = 5000;

export async function handleBuyCommand(interaction: CommandInteraction) {
  const tokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  try {
    const user = await getUser(userId);
    await interaction.deferReply({ ephemeral: false });

    const wallet = user.wallets[0];
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address

    const entryAmounts = user.settings.entryAmounts || ENTRY_SIZES;
    const settings = user.settings;
    const reactionEmojis = REACTION_EMOJIS.slice(0, entryAmounts.length);

    const balance = await getBalance(wallet.publicKey);

    const previewMessage = await interaction.editReply({
      content: `Select your entry size for buying ${tokenAddress}:\n` +
        entryAmounts.map((size, index) => {
          const amount = size;
          return `${reactionEmojis[index]}: ${amount} SOL`;
        }).join('\n') +
        '\nReact with 🚫 to cancel the transaction.',
      fetchReply: true
    });

    for (const emoji of [...reactionEmojis, '🚫']) {
      await previewMessage.react(emoji);
    }

    const filter = (reaction: MessageReaction, user: User) => 
      [...reactionEmojis, '🚫'].includes(reaction.emoji.name!) && user.id === userId;

    const collector = createMessageCollector(previewMessage, filter, 60000);

    collector.on('collect', async (reaction, user) => {
      collector.stop();
      if (reaction.emoji.name === '🚫') {
        await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
        return;
      }

      const sizeIndex = reactionEmojis.indexOf(reaction.emoji.name!);
      const entrySize = entryAmounts[sizeIndex];

      // Fetch token info
      const tokenInfo = await getTokenInfo(inputToken);
      const amount = entrySize;
      let requiredBalance = amount;

      if(inputToken === 'So11111111111111111111111111111111111111112') {
        requiredBalance = amount + (5000000 / 1e9 ); // Add 0.005 SOL for transaction fees (only for SOL)
      } 
      if (balance < requiredBalance) {
        await interaction.followUp({ content: `Insufficient balance. You need at least ${requiredBalance} ${tokenInfo.symbol} for this transaction.`, ephemeral: true });
        return;
      }

      // Adjust the amount based on token decimals
      const adjustedAmount = Math.floor(amount * 10 ** tokenInfo.decimals);

      try {
        const { quoteData, swapPreview } = await createSwapPreview(adjustedAmount, inputToken, tokenAddress, settings);

        console.log('Quote Data:', quoteData);

        const swapPreviewMessage = await interaction.followUp({ content: swapPreview, fetchReply: true });
        await swapPreviewMessage.react('🗑️');

        const cancelFilter = (reaction: MessageReaction, user: User) => 
          reaction.emoji.name === '🗑️' && user.id === userId;

        const cancelCollector = createMessageCollector(swapPreviewMessage, cancelFilter, swapTime);

        cancelCollector.on('collect', async () => {
          cancelCollector.stop();
          await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
        });

        cancelCollector.on('end', async (collected) => {
          if (collected.size === 0) {
            try {
              const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
              console.log('Swap Data:', swapData);
              const signature = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);
              await recordTrade(userId, wallet.publicKey, signature, amount / 10 ** tokenInfo.decimals, tokenAddress);
              await interaction.followUp({ content: `Buy order executed successfully. Transaction ID: ${signature}`, ephemeral: true });
            } catch (error) {
              console.error('Buy execution failed:', error);
              if (error instanceof Error && 'logs' in error) {
                console.error('Transaction logs:', error.logs);
              }
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
