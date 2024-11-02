import {
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  InteractionCollector,
  ButtonInteraction,
  TextChannel,
} from 'discord.js';
import {
  getUser,
  createSwapPreview,
  promptUserConfirmation,
  executeSwapsForUsers,
  swapTime,
} from './swap-base';
import { getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/config/defaultSettings';
import { getConnectedWalletsInChannel, getConnection } from '../../src/lib/utils';
import { IUser, IPreset } from '../../src/models/User';
import { EventEmitter } from 'events';
import { VersionedTransaction } from '@solana/web3.js';

async function retryWithNewBlockhash(transaction: VersionedTransaction, maxRetries = 3): Promise<VersionedTransaction> {
  const connection = await getConnection();
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.message.recentBlockhash = blockhash;
      return transaction;
    } catch (error) {
      attempt++;
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error('Failed to get new blockhash after retries');
}

export async function handleSellCommand(
  interaction: CommandInteraction,
  testCollectorCallback?: (collector: InteractionCollector<ButtonInteraction>) => Promise<void>,
  testPromptResponse?: 'swap_now' | 'cancel_swap' | null,
  swapTime: number = 5000,
  eventEmitter?: EventEmitter
) {
  try {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Error deferring reply:', error);
      return;
    }

    // Check if the interaction is still valid
    if (!interaction.isRepliable()) {
      console.log('Interaction is no longer valid');
      return;
    }

    const inputTokenAddress = interaction.options.get('token')?.value as string;
    const initiatingUserId = interaction.user.id;
    const channelId = interaction.channelId;
    if(testCollectorCallback) {
      console.log('Starting handleSellCommand');
      console.log('Input Token Address:', inputTokenAddress);
      console.log('Initiating User ID:', initiatingUserId);
      console.log('Channel ID:', channelId);
    }

    const initiatingUser = await getUser(initiatingUserId) as IUser;
    const initiatingWallet = initiatingUser.wallets.find((wallet: any) => wallet.connectedChannels.includes(channelId));
    
    if (!initiatingWallet) {
      return interaction.editReply({
        content: "You don't have a wallet connected to this channel. Please connect a wallet first.\nUse `/ct connect` to connect a wallet.",
        components: [],
      });
    }

    const outputTokenAddress = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputTokenAddress);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);

    // Prioritize wallet settings, then primary preset, then user settings, and finally default settings
    const walletSettings = initiatingWallet.settings;
    const primaryPreset = initiatingUser.primaryPresetId 
      ? initiatingUser.presets?.find((p) => p._id?.toString() === initiatingUser.primaryPresetId?.toString()) 
      : null;
    const initiatingSettings = walletSettings || (primaryPreset?.settings || null) || defaultSettings;
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

    const channel = interaction.channel as TextChannel;

    const collector = channel.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector?.on('collect', async (btnInteraction: ButtonInteraction) => {
      if(testCollectorCallback) {
        console.log(`Collector received button interaction: ${btnInteraction.customId}`);
      }

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
              `${swapPreview}\nSubmitting swap in ${swapTime / 1000} seconds.\nClick 'Swap Now' to proceed immediately, or 'Cancel' to abort.`,
              false,
              testPromptResponse
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

              try {
                await executeSwapsForUsers({
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
                  initiatingEntryAmounts: initiatingSettings.entryAmounts,
                  channelId
                }, eventEmitter);
              } catch (error: any) {
                console.error('Error executing swaps:', error);
                if (interaction.isRepliable()) {
                  await interaction.editReply({
                    content: `Failed to execute swaps: ${error.message}`,
                    components: [],
                  });
                } else {
                  console.log('Interaction is no longer valid for editing reply\n(Failed to execute swaps)');
                }
              }
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

          if (!interaction.isRepliable()) {
            console.log('Interaction is no longer valid Please enter a custom percentage)');
            return;
          }

          await interaction.editReply({
            content: 'Please enter a custom percentage (0-100):',
            components: [],
          });
          const messageFilter = (msg: any) => msg.author.id === initiatingUserId;
          const messageCollector = (interaction.channel as TextChannel).createMessageCollector({
            filter: messageFilter,
            max: 1,
            time: 30000,
          });

          messageCollector?.on('collect', async (message: any) => {
            try {
              const input = message.content.trim();
              const customPercentage = parseFloat(input);

              if (isNaN(customPercentage) || customPercentage <= 0 || customPercentage > 100) {
                if (interaction.isRepliable()) {
                  await interaction.editReply({
                    content: 'Invalid percentage. Please enter a number between 0 and 100.',
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

                  try {
                    await executeSwapsForUsers({
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
                      initiatingExitPercentages,
                      customPercentage,
                      channelId
                    }, eventEmitter);
                  } catch (error: any) {
                    console.error('Error executing swaps:', error);
                    if (interaction.isRepliable()) {
                      await interaction.editReply({
                        content: `Failed to execute swaps: ${error.message}`,
                        components: [],
                      });
                    }
                    throw error;
                  }
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
              console.error('Error processing custom percentage:', error);
              if (interaction.isRepliable()) {
                await interaction.editReply({
                  content: `An error occurred while processing your input: ${error.message}`,
                  components: [],
                });
              } else {
                console.log('Interaction is no longer valid for editing reply\n(An error occurred while processing your input.)');
              }
            }
          });

          messageCollector?.on('end', async (_: any, reason: string) => {
            if (reason === 'time') {
              if (interaction.isRepliable()) {
                await interaction.editReply({
                  content: 'Custom percentage input timed out.',
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

    collector?.on('end', async (_: any, reason: string) => {
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

    // If in test mode, invoke the test callback and add more detailed logging
    if (testCollectorCallback) {
      console.log('Test mode: Setting up collector callback');
      try {
        await testCollectorCallback(collector);
      } catch (error) {
        console.error('Error in test collector callback:', error);
      }
    }

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
