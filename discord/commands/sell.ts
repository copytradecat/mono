import {
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import {
  getUser,
  createSwapPreview,
  promptUserConfirmation,
  executeSwapsForUsers,
  generateSelectionButtons,
  swapTime,
} from './swap-base';
import { getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { getConnectedWalletsInChannel } from '../../src/lib/utils';

export async function handleSellCommand(interaction: CommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true }); // Make the interaction ephemeral

    const inputTokenAddress = interaction.options.getString('token', true);
    const initiatingUserId = interaction.user.id;
    const channelId = interaction.channelId;

    const initiatingUser = await getUser(initiatingUserId);
    const initiatingWallet = initiatingUser.wallets[0];
    const outputTokenAddress = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputTokenAddress);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);
    const initiatingExitPercentages = initiatingUser.settings.exitPercentages || defaultSettings.exitPercentages;
    const initiatingSettings = initiatingUser.settings || defaultSettings;

    // Fetch all connected wallets in this channel
    const connectedWallets = await getConnectedWalletsInChannel(channelId);

    // Generate percentage buttons using users' preset exitPercentages
    const percentageButtons = initiatingExitPercentages.map((percentage: number, index: number) =>
      new ButtonBuilder()
        .setCustomId(`percentage_${index}`)
        .setLabel(`${percentage}%`)
        .setStyle(ButtonStyle.Primary)
    );

    // Add custom and cancel buttons
    const customButton = new ButtonBuilder()
      .setCustomId('custom')
      .setLabel('Custom')
      .setStyle(ButtonStyle.Secondary);

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);

    // Assemble buttons into ActionRows
    const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];
    const maxButtonsPerRow = 5;

    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    for (const button of percentageButtons) {
      if (currentRow.components.length >= maxButtonsPerRow) {
        // Only add the row if it has components
        if (currentRow.components.length > 0) {
          buttonRows.push(currentRow);
        }
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }
      currentRow.addComponents(button);
    }

    // Add custom and cancel buttons
    if (currentRow.components.length >= maxButtonsPerRow) {
      buttonRows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
    currentRow.addComponents(customButton);

    if (currentRow.components.length >= maxButtonsPerRow) {
      buttonRows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
    currentRow.addComponents(cancelButton);

    // Add any remaining buttons
    if (currentRow.components.length > 0) {
      buttonRows.push(currentRow);
    }

    // Ensure we have at least one ActionRow with components
    if (buttonRows.length === 0) {
      currentRow = new ActionRowBuilder<ButtonBuilder>();
      currentRow.addComponents(cancelButton);
      buttonRows.push(currentRow);
    }

    await interaction.editReply({
      content: `Select a percentage of your ${inputTokenInfo.symbol} to sell:`,
      components: buttonRows,
    });

    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30000, // 30 seconds
    });

    collector?.on('collect', async (btnInteraction) => {
      try {
        await btnInteraction.deferUpdate();

        if (btnInteraction.customId.startsWith('percentage_')) {
          const index = parseInt(btnInteraction.customId.replace('percentage_', ''));
          const selectedPercentage = initiatingExitPercentages[index];
          const selectionIndex = index;

          collector.stop();

          // For swap preview, we'll need to calculate the amount based on user's balance
          const { balance: tokenBalanceRaw } = await getTokenBalance(initiatingWallet.publicKey, inputTokenAddress);

          // Convert raw balance to human-readable balance
          const tokenBalance = tokenBalanceRaw / (10 ** inputTokenInfo.decimals);

          // Calculate the amount to sell (human-readable)
          const amountToSell = (selectedPercentage / 100) * tokenBalance;

          // Convert the amount to sell back to raw amount
          const adjustedAmount = Math.floor(amountToSell * (10 ** inputTokenInfo.decimals));

          // Check if adjustedAmount is greater than zero
          if (adjustedAmount <= 0) {
            await interaction.editReply({
              content: 'Your balance is insufficient to perform this swap.',
              components: [],
            });
            return;
          }

          // Proceed to create swap preview
          const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
            adjustedAmount,
            inputTokenAddress,
            outputTokenAddress,
            initiatingSettings,
            inputTokenInfo,
            outputTokenInfo
          );

          // Prompt user confirmation
          const swapCollector = await promptUserConfirmation(
            interaction,
            `${swapPreview}\nSubmitting swap in ${swapTime / 1000} seconds.\nClick 'Swap Now' to proceed immediately, or 'Cancel' to abort.`
          );

          swapCollector?.on('collect', async (i) => {
            try {
              if (i.isRepliable()) {
                await i.deferUpdate();
              } else {
                console.warn('Interaction not repliable.');
                return;
              }

              if (i.customId === 'swap_now') {
                swapCollector.stop();

                await i.editReply({
                  content: 'Processing swaps...',
                  components: [],
                });

                // Execute swaps for users
                const tradeResults = await executeSwapsForUsers({
                  interaction,
                  connectedWallets,
                  selectionIndex,
                  isBuyOperation: false,
                  inputTokenInfo,
                  outputTokenInfo,
                  inputTokenAddress,
                  outputTokenAddress,
                  initiatingUser,
                  initiatingSettings,
                  initiatingExitPercentages,
                });

                // All messaging is handled within executeSwapForUser

              } else if (i.customId === 'cancel_swap') {
                swapCollector.stop();
                await i.editReply({
                  content: 'Transaction cancelled.',
                  components: [],
                });
              }
            } catch (error) {
              console.error('Error in swapCollector:', error);
              try {
                await i.editReply({
                  content: 'An error occurred during the swap execution.',
                });
              } catch (followUpError) {
                console.error('Error sending follow-up message:', followUpError);
              }
            }
          });

        } else if (btnInteraction.customId === 'custom') {
          collector.stop();

          // Prompt the user to enter a custom percentage
          await btnInteraction.editReply({
            content: 'Please enter a custom percentage (0 - 100):',
            components: [],
          });

          // Create a message collector to collect the user's input
          const messageFilter = (msg: any) => msg.author.id === initiatingUserId;
          const messageCollector = interaction.channel?.createMessageCollector({
            filter: messageFilter,
            max: 1,
            time: 30000, // 30 seconds to enter percentage
          });

          messageCollector?.on('collect', async (message: any) => {
            try {
              const input = message.content.trim();
              const customPercentage = parseFloat(input);
              if (isNaN(customPercentage) || customPercentage <= 0 || customPercentage > 100) {
                await interaction.editReply({
                  content: 'Invalid percentage entered. Transaction cancelled.',
                });
                return;
              }

              // For swap preview, calculate the amount
              const { balance: tokenBalance } = await getTokenBalance(initiatingWallet.publicKey, inputTokenAddress);
              const amountToSell = (customPercentage / 100) * tokenBalance;

              // Create swap preview
              const adjustedAmount = Math.floor(amountToSell);

              if (adjustedAmount <= 0) {
                await interaction.editReply({
                  content: 'Your balance is insufficient to perform this swap.',
                  components: [],
                });
                return;
              }

              // Proceed to create swap preview
              const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
                adjustedAmount,
                inputTokenAddress,
                outputTokenAddress,
                initiatingSettings,
                inputTokenInfo,
                outputTokenInfo
              );

              // Prompt user confirmation
              const swapCollector = await promptUserConfirmation(
                interaction,
                `${swapPreview}\nSubmitting swap in ${swapTime / 1000} seconds.\nClick 'Swap Now' to proceed immediately, or 'Cancel' to abort.`
              );

              swapCollector?.on('collect', async (i) => {
                try {
                  if (i.isRepliable()) {
                    await i.deferUpdate();
                  } else {
                    console.warn('Interaction not repliable.');
                    return;
                  }

                  if (i.customId === 'swap_now') {
                    swapCollector.stop();

                    await i.editReply({
                      content: 'Processing swaps...',
                      components: [],
                    });

                    // Execute swaps for users
                    const tradeResults = await executeSwapsForUsers({
                      interaction,
                      connectedWallets,
                      selectionIndex: 'Custom',
                      isBuyOperation: false,
                      inputTokenInfo,
                      outputTokenInfo,
                      inputTokenAddress,
                      outputTokenAddress,
                      initiatingUser,
                      initiatingSettings,
                      customPercentage,
                    });

                    // All messaging is handled within executeSwapForUser

                  } else if (i.customId === 'cancel_swap') {
                    swapCollector.stop();
                    await i.editReply({
                      content: 'Transaction cancelled.',
                      components: [],
                    });
                  }
                } catch (error) {
                  console.error('Error in swapCollector:', error);
                  try {
                    await i.editReply({
                      content: 'An error occurred during the swap execution.',
                    });
                  } catch (followUpError) {
                    console.error('Error sending follow-up message:', followUpError);
                  }
                }
              });

            } catch (error) {
              console.error('Error in messageCollector:', error);
              await interaction.editReply({
                content: 'An error occurred while processing your input.',
              });
            }
          });

        } else if (btnInteraction.customId === 'cancel') {
          collector.stop();
          await btnInteraction.editReply({
            content: 'Transaction cancelled.',
            components: [],
          });
        }

      } catch (error) {
        console.error('Error in collector:', error);
        try {
          await btnInteraction.followUp({
            content: 'An error occurred during the process.',
            ephemeral: true,
          });
        } catch (followUpError) {
          console.error('Error sending follow-up message:', followUpError);
        }
      }
    });

    collector?.on('end', async (_, reason) => {
      if (reason === 'time') {
        try {
          await interaction.editReply({
            content: 'Interaction timed out.',
            components: [],
          });
        } catch (error) {
          console.error('Error editing reply on timeout:', error);
        }
      }
    });

  } catch (error) {
    console.error('Error in handleSellCommand:', error);
    try {
      await interaction.editReply({
        content: 'An error occurred while processing your request.',
      });
    } catch (editError) {
      console.error('Error editing reply:', editError);
    }
  }
}