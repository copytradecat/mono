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
  swapTime,
} from './swap-base';
import { getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { getConnectedWalletsInChannel } from '../../src/lib/utils';

export async function handleSellCommand(interaction: CommandInteraction) {
  try {
    // Check if the interaction is still valid
    if (!interaction.isRepliable()) {
      console.log('Interaction is no longer valid');
      return;
    }
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Error deferring reply:', error);
      return;
    }

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
      time: 60000, // 60 seconds
    });

    collector?.on('collect', async (btnInteraction) => {
      try {
        await btnInteraction.deferUpdate();

        if (btnInteraction.customId.startsWith('percentage_')) {
          const index = parseInt(btnInteraction.customId.replace('percentage_', ''));
          const selectedPercentage = initiatingExitPercentages[index];
          const selectionIndex = index;

          collector.stop();

          // Calculate the amount to sell
          const { balance: tokenBalance } = await getTokenBalance(initiatingWallet.publicKey, inputTokenAddress);
          const adjustedAmount = Math.floor((selectedPercentage / 100) * tokenBalance);

          if (adjustedAmount <= 0) {
            await interaction.editReply({
              content:  `Your balance is insufficient to perform this swap.\nTrading ${adjustedAmount} but have only ${tokenBalance} ${inputTokenInfo.symbol}`,
              components: [],
            });
            return;
          }

          // Create swap preview
          try {
            const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
              adjustedAmount,
              inputTokenAddress,
              outputTokenAddress,
              initiatingSettings,
              inputTokenInfo,
              outputTokenInfo
            );

            // Prompt user confirmation
            const userResponse = await promptUserConfirmation(
              interaction,
              `${swapPreview}\nSubmitting swap in ${swapTime / 1000} seconds.\nClick 'Swap Now' to proceed immediately, or 'Cancel' to abort.`
            );

            if (userResponse === 'swap_now' || userResponse === 'timeout') {
              await interaction.editReply({
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

              // All messaging is handled within executeSwapsForUsers

            } else if (userResponse === 'cancel_swap') {
              await interaction.editReply({
                content: 'Swap cancelled by user.',
                components: [],
              });
            }
          } catch (error: any) {
            console.error('Error in swap process:', error);
            await interaction.editReply({
              content: `An error occurred during the swap process: ${error.message}`,
              components: [],
            });
          }
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
                  components: [],
                });
                return;
              }

              // Calculate the amount to sell
              const { balance: tokenBalance } = await getTokenBalance(initiatingWallet.publicKey, inputTokenAddress);
              const adjustedAmount = Math.floor((customPercentage / 100) * tokenBalance);

              if (adjustedAmount <= 0) {
                await interaction.editReply({
                  content: `Your balance is insufficient to perform this swap.\nTrading ${adjustedAmount} but have only ${tokenBalance} ${inputTokenInfo.symbol}`,
                  components: [],
                });
                return;
              }

              // Create swap preview
              try {
                const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
                  adjustedAmount,
                  inputTokenAddress,
                  outputTokenAddress,
                  initiatingSettings,
                  inputTokenInfo,
                  outputTokenInfo
                );

                // Prompt user confirmation
                const userResponse = await promptUserConfirmation(
                  interaction,
                  `${swapPreview}\nSubmitting swap in ${swapTime / 1000} seconds.\nClick 'Swap Now' to proceed immediately, or 'Cancel' to abort.`
                );

                if (userResponse === 'swap_now' || userResponse === 'timeout') {
                  await interaction.editReply({
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

                  // All messaging is handled within executeSwapsForUsers

                } else if (userResponse === 'cancel_swap') {
                  await interaction.editReply({
                    content: 'Swap cancelled by user.',
                    components: [],
                  });
                }
              } catch (error: any) {
                console.error('Error in swap process:', error);
                await interaction.editReply({
                  content: `An error occurred during the swap process: ${error.message}`,
                  components: [],
                });
              }
            } catch (error: any) {
              console.error('Error in message collector:', error);
              await interaction.editReply({
                content: 'An error occurred while processing your input.',
                components: [],
              });
            }
          });

          messageCollector?.on('end', async (_, reason) => {
            if (reason === 'time') {
              await interaction.editReply({
                content: 'Interaction timed out.',
                components: [],
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
      } catch (error: any) {
        console.error('Error in collector:', error);
        try {
          await btnInteraction.followUp({
            content: `An error occurred during the process: ${error.message}`,
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

  } catch (error: any) {
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