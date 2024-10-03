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
import { getConnectedWalletsInChannel, truncatedString } from '../../src/lib/utils';

export async function handleBuyCommand(interaction: CommandInteraction) {
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

    const outputTokenAddress = interaction.options.getString('token', true);
    const initiatingUserId = interaction.user.id;
    const channelId = interaction.channelId;

    const initiatingUser = await getUser(initiatingUserId);
    const initiatingWallet = initiatingUser.wallets[0];
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputToken);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);
    const initiatingEntryAmounts = initiatingUser.settings.entryAmounts || defaultSettings.entryAmounts;
    const initiatingSettings = initiatingUser.settings || defaultSettings;

    // Fetch all connected wallets in this channel
    const connectedWallets = await getConnectedWalletsInChannel(channelId);

    // Generate amount buttons using users' preset entryAmounts
    const amountButtons = initiatingEntryAmounts.map((amount: number, index: number) =>
      new ButtonBuilder()
        .setCustomId(`amount_${index}`)
        .setLabel(`${amount} ${inputTokenInfo.symbol}`)
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
    for (const button of amountButtons) {
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
      content: `Select the amount of ${outputTokenInfo.symbol} ([${truncatedString(outputTokenAddress, 4)}](<https://solscan.io/token/${outputTokenAddress}>)) you wish to buy:`,
      components: buttonRows,
    });

    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000, // 60 seconds
    });

    collector.on('collect', async (btnInteraction) => {
      try {
        if (!btnInteraction.isRepliable()) {
          console.log('Button interaction is no longer valid');
          return;
        }
        await btnInteraction.deferUpdate();

        if (btnInteraction.customId.startsWith('amount_')) {
          const index = parseInt(btnInteraction.customId.replace('amount_', ''));
          const selectedAmount = initiatingEntryAmounts[index];
          const selectionIndex = index;

          collector.stop();

          // Create swap preview
          const adjustedAmount = Math.floor(selectedAmount * 10 ** inputTokenInfo.decimals);

          try {
            const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
              adjustedAmount,
              inputToken,
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
                isBuyOperation: true,
                inputTokenInfo,
                outputTokenInfo,
                inputTokenAddress: inputToken,
                outputTokenAddress,
                initiatingUser,
                initiatingSettings,
                initiatingEntryAmounts,
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

          // Prompt the user to enter a custom amount
          await btnInteraction.editReply({
            content: 'Please enter a custom amount (in SOL):',
            components: [],
          });

          // Create a message collector to collect the user's input
          const messageFilter = (msg: any) => msg.author.id === initiatingUserId;
          const messageCollector = interaction.channel?.createMessageCollector({
            filter: messageFilter,
            max: 1,
            time: 30000, // 30 seconds to enter amount
          });

          messageCollector?.on('collect', async (message: any) => {
            try {
              const input = message.content.trim();
              const customAmount = parseFloat(input);
              if (isNaN(customAmount) || customAmount <= 0) {
                await interaction.editReply({
                  content: 'Invalid amount entered. Transaction cancelled.',
                });
                return;
              }

              // Create swap preview
              const adjustedAmount = Math.floor(customAmount * 10 ** inputTokenInfo.decimals);
              let requiredBalance = adjustedAmount;

              // if (inputToken === 'So11111111111111111111111111111111111111112') {
              //   requiredBalance = adjustedAmount + 0.005; // Add 0.005 SOL for transaction fees (only for SOL)
              // }
              // if (balance < requiredBalance) {
              if(adjustedAmount <= 0) {
                await interaction.editReply({
                  // content: `Insufficient balance. You need at least ${requiredBalance} ${inputTokenInfo.symbol} for this transaction.`,
                  content: 'Trade amount must be greater than 0.',
                  components: [],
                });
                return;
              }

              const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
                adjustedAmount,
                inputToken,
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
                userResponse.on('collect', async (i) => {
                  try {
                    if (i.isRepliable()) {
                      await i.deferUpdate();
                    } else {
                      console.warn('Interaction not repliable.');
                      return;
                    }

                    if (i.customId === 'swap_now') {
                      userResponse.stop();

                      await i.editReply({
                        content: 'Processing swaps...',
                        components: [],
                      });

                      // Execute swaps for users
                      const tradeResults = await executeSwapsForUsers({
                        interaction,
                        connectedWallets,
                        selectionIndex: 'Custom',
                        isBuyOperation: true,
                        inputTokenInfo,
                        outputTokenInfo,
                        inputTokenAddress: inputToken,
                        outputTokenAddress,
                        initiatingUser,
                        initiatingSettings,
                        customAmount,
                      });

                      // All messaging is handled within executeSwapForUser

                    } else if (i.customId === 'cancel_swap') {
                      userResponse.stop();
                      await i.editReply({
                        content: 'Transaction cancelled.',
                        components: [],
                      });
                    }
                  } catch (error) {
                    console.error('Error in userResponse:', error);
                    try {
                      await i.editReply({
                        content: 'An error occurred during the swap execution.',
                      });
                    } catch (followUpError) {
                      console.error('Error sending follow-up message:', followUpError);
                    }
                  }
                });
              } else if (userResponse === 'cancel_swap') {
                await interaction.editReply({
                  content: 'Swap cancelled.',
                  components: [],
                });
              }

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

  } catch (error) {
    console.error('Error in handleBuyCommand:', error);
    if (interaction.isRepliable()) {
      try {
        await interaction.editReply({
          content: 'An error occurred while processing your request.',
        });
      } catch (editError) {
        console.error('Error editing reply:', editError);
      }
    } else {
      console.log('Interaction is no longer valid for error response');
    }
  }
}