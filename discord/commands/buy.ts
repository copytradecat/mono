import {
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from 'discord.js';
import {
  getUser,
  getBalance,
  createSwapPreview,
  executeSwap,
  recordTrade,
  swapTime,
} from './swap-base';
import { getSwapTransaction, getTokenInfo } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { truncatedString } from '../../src/lib/utils';

export async function handleBuyCommand(interaction: CommandInteraction) {
  const outputTokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  try {
    const user = await getUser(userId);
    const wallet = user.wallets[0];
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputToken);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);
    const entryAmounts = user.settings.entryAmounts || [0.05, 0.1, 0.25, 0.5, 1];
    const settings = user.settings || defaultSettings;

    const balanceLamports = await getBalance(wallet.publicKey);
    const balance = balanceLamports / 10 ** 9; // Convert lamports to SOL

    const select = new StringSelectMenuBuilder()
      .setCustomId('entry_amount')
      .setPlaceholder('Select an entry amount')
      .addOptions(
        entryAmounts.map((amount) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${amount} SOL`)
            .setValue(amount.toString())
        )
      )
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('Custom amount').setValue('custom'),
        new StringSelectMenuOptionBuilder().setLabel('Cancel').setValue('cancel'),
      ]);
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const response = await interaction.editReply({
      content: `Select your entry size for buying ${outputTokenInfo.symbol} ([${truncatedString(outputTokenAddress, 4)}](<https://solscan.io/token/${outputTokenAddress}>)):`,
      components: [row],
    });

    try {
      const collectorFilter = (i: { user: { id: string } }) => i.user.id === interaction.user.id;
      const confirmation = await response.awaitMessageComponent({
        filter: collectorFilter,
        time: 60000,
      });

      if (confirmation.customId === 'entry_amount') {
        await confirmation.deferUpdate();

        if (confirmation.values[0] === 'cancel') {
          await interaction.editReply({ content: 'Buy order cancelled.', components: [] });
          return;
        }

        let selectedAmount: number;
        if (confirmation.values[0] === 'custom') {
          await interaction.editReply({
            content: 'Please enter the custom amount in SOL:',
            components: [],
          });
          try {
            const customAmountResponse = await interaction.channel!.awaitMessages({
              filter: (m) => m.author.id === interaction.user.id,
              max: 1,
              time: 30000,
              errors: ['time'],
            });
            selectedAmount = parseFloat(customAmountResponse.first()!.content);
            if (isNaN(selectedAmount) || selectedAmount <= 0) {
              await interaction.editReply({
                content: 'Invalid amount. Buy order cancelled.',
                components: [],
              });
              return;
            }
          } catch (error) {
            await interaction.editReply({
              content: 'No amount provided. Buy order cancelled.',
              components: [],
            });
            return;
          }
        } else {
          selectedAmount = parseFloat(confirmation.values[0]);
        }

        let requiredBalance = selectedAmount;

        if (inputToken === 'So11111111111111111111111111111111111111112') {
          requiredBalance = selectedAmount + 0.005; // Add 0.005 SOL for transaction fees (only for SOL)
        }
        if (balance < requiredBalance) {
          await interaction.editReply({
            content: `Insufficient balance. You need at least ${requiredBalance} ${inputTokenInfo.symbol} for this transaction.`,
            components: [],
          });
          return;
        }

        const adjustedAmount = Math.floor(selectedAmount * 10 ** inputTokenInfo.decimals);

        const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
          adjustedAmount,
          inputToken,
          outputTokenAddress,
          settings
        );

        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_swap')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton);

        await interaction.editReply({
          content: `${swapPreview}\n\nClick cancel within 5 seconds to cancel the swap.`,
          components: [buttonRow],
        });

        try {
          const buttonCollector = (await interaction.fetchReply()).createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: swapTime,
          });

          let transactionCancelled = false;

          buttonCollector.on('collect', async (btnInteraction) => {
            if (btnInteraction.customId === 'cancel_swap' && btnInteraction.user.id === userId) {
              transactionCancelled = true;
              buttonCollector.stop();
              try {
                await btnInteraction.update({
                  content: 'Transaction cancelled.',
                  components: [],
                });
              } catch (error) {
                console.error('Error updating button interaction:', error);
                await interaction.followUp({
                  content: 'Transaction cancelled.',
                  ephemeral: true,
                });
              }
            } else {
              await btnInteraction.reply({ content: 'You cannot use this button.', ephemeral: true });
            }
          });

          buttonCollector.on('end', async () => {
            if (!transactionCancelled) {
              try {
                await interaction.editReply({
                  content: 'Processing your swap...',
                  components: [],
                });

                const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
                const swapResult = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);

                if (swapResult.success) {
                  await recordTrade(userId, wallet.publicKey, swapResult.signature, selectedAmount, outputTokenAddress);

                  const selectionIndex = entryAmounts.indexOf(selectedAmount) !== -1 
                    ? ['small 🤏', 'medium ✊', 'Large 🤲', 'Very Large 🙌', 'Massive 🦍', 'MEGAMOON 🌝'][Math.floor(entryAmounts.indexOf(selectedAmount) / 2)]
                    : 'Custom';

                  await interaction.editReply({
                    content: `Swap Complete!\n\nBought: ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>)\nUsing: ${selectedAmount} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputToken}>)\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)`,
                    components: [],
                  });

                  // if(settings.private) const publicMessage = `**${interaction.user.username}** bought **${selectedAmount} ${inputTokenInfo.symbol}** worth of **${outputTokenInfo.symbol}**`;
                  const publicMessage = `**${interaction.user.username}** bought a **${selectionIndex}** amount of **[${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>)** at **${estimatedOutput/selectedAmount} ${outputTokenInfo.symbol}/${inputTokenInfo.symbol}**`;
                  await interaction.channel?.send(publicMessage);
                } else {
                  const errorMessage = `Failed to execute buy order. Reason: ${swapResult.transactionMessage}\n\nError details: ${swapResult.error}`;
                  try {
                    await interaction.editReply({
                      content: errorMessage,
                      components: [],
                    });
                  } catch (replyError) {
                    console.error('Error editing reply:', replyError);
                    await interaction.followUp({
                      content: errorMessage,
                      ephemeral: true,
                    });
                  }
                }
              } catch (error: any) {
                console.error('Error executing swap:', error);
                let errorMessage = 'Failed to execute buy order. Please try again later.';
                if (error.message.includes('TransactionExpiredTimeoutError')) {
                  const match = error.message.match(/Check signature ([a-zA-Z0-9]+)/);
                  const signature = match ? match[1] : 'unknown';
                  errorMessage = `Transaction timed out. It is unknown if it succeeded or failed. Check signature ${signature} using the Solana Explorer or CLI tools.`;
                }
                try {
                  await interaction.editReply({
                    content: errorMessage,
                    components: [],
                  });
                } catch (replyError) {
                  console.error('Error editing reply:', replyError);
                  await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true,
                  });
                }
              }
            }
          });
        } catch (error) {
          console.error('Error in button collector:', error);
          await interaction.followUp({
            content: 'An error occurred while processing your buy order.',
            ephemeral: true,
          });
        }
      }
    } catch (error) {
      console.error('Buy order timed out or was cancelled:', error);
      await interaction.editReply({
        content: 'Buy order timed out or was cancelled. Please try again.',
        components: [],
      });
    }
  } catch (error) {
    console.error('Error in handleBuyCommand:', error);
    await interaction.editReply({
      content: 'An error occurred while processing your buy order.',
      components: [],
    });
  }
}
