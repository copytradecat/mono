import { CommandInteraction, MessageReaction, User, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } from 'discord.js';
import { getUser, getBalance, createSwapPreview, executeSwap, recordTrade } from './swap-base';
import { getSwapTransaction, getTokenInfo } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';

const swapTime = 5000;

export async function handleBuyCommand(interaction: CommandInteraction) {
  const tokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  try {
    const user = await getUser(userId);
    await interaction.deferReply({ ephemeral: false });

    const wallet = user.wallets[0];
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address

    const entryAmounts = user.settings.entryAmounts || [0.05, 0.1, 0.25, 0.5, 1];
    const settings = user.settings || defaultSettings;

    const balance = await getBalance(wallet.publicKey);

    const select = new StringSelectMenuBuilder()
      .setCustomId('entry_amount')
      .setPlaceholder('Select an entry amount')
      .addOptions(
        entryAmounts.map((amount, index) => 
          new StringSelectMenuOptionBuilder()
            .setLabel(`${amount} SOL`)
            .setValue(amount.toString())
        )
      )
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel('Custom amount')
          .setValue('custom'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Cancel')
          .setValue('cancel')
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const response = await interaction.editReply({
      content: `Select your entry size for buying ${tokenAddress}:`,
      components: [row],
    });

    try {
      const collectorFilter = (i: { user: { id: string; }; }) => i.user.id === interaction.user.id;
      const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });

      if (confirmation.customId === 'entry_amount') {
        if (confirmation.values[0] === 'cancel') {
          await interaction.followUp({ content: 'Buy order cancelled.', ephemeral: true });
          return;
        }

        let selectedAmount: number;
        if (confirmation.values[0] === 'custom') {
          await interaction.followUp({ content: 'Please enter the custom amount in SOL:', ephemeral: true });
          try {
            const customAmountResponse = await interaction.channel!.awaitMessages({
              filter: (m) => m.author.id === interaction.user.id,
              max: 1,
              time: 30000,
              errors: ['time']
            });
            selectedAmount = parseFloat(customAmountResponse.first()!.content);
            if (isNaN(selectedAmount) || selectedAmount <= 0) {
              await interaction.followUp({ content: 'Invalid amount. Buy order cancelled.', ephemeral: true });
              return;
            }
          } catch (error) {
            await interaction.followUp({ content: 'No amount provided. Buy order cancelled.', ephemeral: true });
            return;
          }
        } else {
          selectedAmount = parseFloat(confirmation.values[0]);
        }

        // Fetch token info
        const tokenInfo = await getTokenInfo(inputToken);
        let requiredBalance = selectedAmount;

        if (inputToken === 'So11111111111111111111111111111111111111112') {
          requiredBalance = selectedAmount + (5000000 / 1e9); // Add 0.005 SOL for transaction fees (only for SOL)
        }
        if (balance < requiredBalance) {
          await interaction.followUp({ content: `Insufficient balance. You need at least ${requiredBalance} ${tokenInfo.symbol} for this transaction.`, ephemeral: true });
          return;
        }

        // Adjust the amount based on token decimals
        const adjustedAmount = Math.floor(selectedAmount * 10 ** tokenInfo.decimals);

        try {
          const { quoteData, swapPreview } = await createSwapPreview(adjustedAmount, inputToken, tokenAddress, settings);

          console.log('Quote Data:', quoteData);

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
                console.log('Swap Data:', swapData);
                const signature = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);
                await recordTrade(userId, wallet.publicKey, signature, selectedAmount, tokenAddress);
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
      }
    } catch (e) {
      await interaction.followUp({ content: 'Buy order timed out or was cancelled. Please try again.', ephemeral: true });
    }

  } catch (error) {
    console.error('Error in handleBuyCommand:', error);
    interaction.followUp({ content: 'An error occurred while processing your buy order.', ephemeral: true });
  }
}
