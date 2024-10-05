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
    const initiatingWallet = initiatingUser.wallets.find((wallet: any) => wallet.connectedChannels.includes(channelId));
    if (!initiatingWallet) {
      return interaction.editReply({
        content: "You don't have a wallet connected to this channel. Please connect a wallet first.",
        components: [],
      });
    }
    const outputTokenAddress = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputTokenAddress);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);

    // Prioritize wallet settings, then primary preset, then user settings, and finally default settings
    const walletSettings = initiatingWallet?.settings;
    const primaryPreset = initiatingUser.primaryPresetId ? initiatingUser.presets.find(p => p._id.toString() === initiatingUser.primaryPresetId.toString()) : null;
    const initiatingSettings = walletSettings || (primaryPreset ? primaryPreset.settings : null) || initiatingUser.settings || defaultSettings;
    const initiatingExitPercentages = initiatingSettings.exitPercentages || defaultSettings.exitPercentages;

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
        if (!btnInteraction.isRepliable()) {
          console.log('Button interaction is no longer valid');
          return;
        }
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
            if (interaction.isRepliable()) {
              await interaction.editReply({
                content:  `Your balance is insufficient to perform this swap.\nTrading ${adjustedAmount} but have only ${tokenBalance} ${inputTokenInfo.symbol}`,
                components: [],
              });
            } else {
              console.log('Interaction is no longer valid for editing reply\n(Your balance is insufficient to perform this swap.\)');
            }
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
              if (interaction.isRepliable()) {
                await interaction.editReply({
                  content: 'Processing swaps...',
                  components: [],
                });
              } else {
                console.log('Interaction is no longer valid for editing reply\n(Processing swaps...)');
              }

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
                channelId
              });

              // All messaging is handled within executeSwapsForUsers

            } else if (userResponse === 'cancel_swap') {
              if (interaction.isRepliable()) {
                await interaction.editReply({
                  content: 'Swap cancelled by user.',
                  components: [],
                });
              } else {
                console.log('Interaction is no longer valid for editing reply\n(Swap cancelled by user.)');
              }
            }
          } catch (error: any) {
            console.error('Error in swap process:', error);
            if (interaction.isRepliable()) {
              await interaction.editReply({
                content: `An error occurred during the swap process: ${error.message}`,
                components: [],
              });
            } else {
              console.log('Interaction is no longer valid for editing reply\n(An error occurred during the swap process:)');
            }
          }
        } else if (btnInteraction.customId === 'custom') {
          collector.stop();

          // Prompt the user to enter a custom percentage
          if (interaction.isRepliable()) {
            await btnInteraction.editReply({
              content: 'Please enter a custom percentage (0 - 100):',
              components: [],
            });
          } else {
            console.log('Interaction is no longer valid for editing reply\n(Please enter a custom percentage (0 - 100):)');
          }

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
                if (interaction.isRepliable()) {
                  await interaction.editReply({
                    content: 'Invalid percentage entered. Transaction cancelled.',
                    components: [],
                  });
                } else {
                  console.log('Interaction is no longer valid for editing reply\n(Invalid percentage entered. Transaction cancelled.) ');
                }
                return;
              }

              // Calculate the amount to sell
              const { balance: tokenBalance } = await getTokenBalance(initiatingWallet.publicKey, inputTokenAddress);
              const adjustedAmount = Math.floor((customPercentage / 100) * tokenBalance);

              if (adjustedAmount <= 0) {
                if (interaction.isRepliable()) {
                  await interaction.editReply({
                    content: `Your balance is insufficient to perform this swap.\nTrading ${adjustedAmount} but have only ${tokenBalance} ${inputTokenInfo.symbol}`,
                    components: [],
                  });
                } else {
                  console.log('Interaction is no longer valid for editing reply\n(Your balance is insufficient to perform this swap.)');
                }
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
                  if (interaction.isRepliable()) {
                    await interaction.editReply({
                      content: 'Processing swaps...',
                      components: [],
                    });
                  } else {
                    console.log('Interaction is no longer valid for editing reply\n(Processing swaps...)');
                  }

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
                    channelId
                  });

                  // All messaging is handled within executeSwapsForUsers

                } else if (userResponse === 'cancel_swap') {
                  if (interaction.isRepliable()) {
                    await interaction.editReply({
                      content: 'Swap cancelled by user.',
                      components: [],
                    });
                  } else {
                    console.log('Interaction is no longer valid for editing reply\n(Swap cancelled by user.)');
                  }
                }
              } catch (error: any) {
                console.error('Error in swap process:', error);
                if (interaction.isRepliable()) {
                  await interaction.editReply({
                    content: `An error occurred during the swap process: ${error.message}`,
                    components: [],
                  });
                } else {
                  console.log('Interaction is no longer valid for editing reply\n(An error occurred during the swap process:)');
                }
              }
            } catch (error: any) {
              console.error('Error in message collector:', error);
              if (interaction.isRepliable()) {
                await interaction.editReply({
                  content: 'An error occurred while processing your input.',
                  components: [],
                });
              } else {
                console.log('Interaction is no longer valid for editing reply\n(An error occurred while processing your input.)');
              }
            }
          });

          messageCollector?.on('end', async (_, reason) => {
            if (reason === 'time') {
              if (interaction.isRepliable()) {
                await interaction.editReply({
                  content: 'Interaction timed out.',
                  components: [],
                });
              } else {
                console.log('Interaction is no longer valid for editing reply\n(Interaction timed out.)');
              }
            }
          });
        } else if (btnInteraction.customId === 'cancel') {
          collector.stop();
          if (interaction.isRepliable()) {
            await btnInteraction.editReply({
              content: 'Transaction cancelled.',
              components: [],
            });
          } else {
            console.log('Interaction is no longer valid for editing reply\n(Transaction cancelled.)');
          }
        }
      } catch (error: any) {
        console.error('Error in collector:', error);
        try {
          if (btnInteraction.isRepliable()) {
            await btnInteraction.followUp({
              content: `An error occurred during the process: ${error.message}`,
              ephemeral: true,
            });
          } else {
            console.log('Interaction is no longer valid for following up\n(An error occurred during the process:)');
          }
        } catch (followUpError) {
          console.error('Error sending follow-up message:', followUpError);
        }
      }
    });

    collector?.on('end', async (_, reason) => {
      if (reason === 'time') {
        try {
          if (interaction.isRepliable()) {
            await interaction.editReply({
              content: 'Interaction timed out.',
              components: [],
            });
          } else {
            console.log('Interaction is no longer valid for editing reply\n(Interaction timed out.)');
          }
        } catch (error) {
          console.error('Error editing reply on timeout:', error);
        }
      }
    });

  } catch (error) {
    console.error('Error in handleSellCommand:', error);
    if (interaction.isRepliable()) {
      try {
        await interaction.editReply({
          content: 'An error occurred while processing your request.',
          components: [],
        });
      } catch (editError) {
        console.error('Error editing reply:', editError);
      }
    } else {
      console.log('Interaction is no longer valid for error response');
    }
  }
}