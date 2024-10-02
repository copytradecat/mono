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
  executeSwapForUser,
} from './swap-base';
import { getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { truncatedString, getConnectedWalletsInChannel, mapSelectionToUserSettings } from '../../src/lib/utils';
import pLimit from 'p-limit';

export async function handleSellCommand(interaction: CommandInteraction) {
  const inputTokenAddress = interaction.options.getString('token', true);
  const initiatingUserId = interaction.user.id;
  const channelId = interaction.channelId;

  try {
    await interaction.deferReply();
  } catch (error) {
    console.error('Error deferring reply:', error);
    return;
  }

  try {
    const initiatingUser = await getUser(initiatingUserId);
    const initiatingWallet = initiatingUser.wallets[0];
    const outputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputTokenAddress);
    const outputTokenInfo = await getTokenInfo(outputToken);
    const initiatingExitPercentages = initiatingUser.settings.exitPercentages || defaultSettings.exitPercentages;
    const initiatingSettings = initiatingUser.settings || defaultSettings;

    // Fetch all connected wallets in this channel
    const connectedWallets = await getConnectedWalletsInChannel(channelId);

    // Combine percentage buttons with custom and cancel buttons
    const buttons = initiatingExitPercentages.map((percentage) =>
      new ButtonBuilder()
        .setCustomId(`percentage_${percentage}`)
        .setLabel(`${percentage}%`)
        .setStyle(ButtonStyle.Primary)
    );

    // Add custom and cancel buttons
    buttons.push(
      new ButtonBuilder()
        .setCustomId('custom')
        .setLabel('Custom percentage')
        .setStyle(ButtonStyle.Secondary)
    );
    buttons.push(
      new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    // Split buttons into chunks of up to 5
    const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      buttonRows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.slice(i, i + 5)
        )
      );
    }

    await interaction.editReply({
      content: `Select the percentage of ${inputTokenInfo.symbol} ([${truncatedString(inputTokenAddress, 4)}](<https://solscan.io/token/${inputTokenAddress}>)) you wish to sell:`,
      components: buttonRows,
    });

    const filter = (btnInteraction: any) => btnInteraction.user.id === initiatingUserId;

    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      componentType: ComponentType.Button,
      time: 30000, // 30 seconds to make a selection
    });

    let selectedPercentage: number = 0;
    let selectionIndex: number = -1;

    collector?.on('collect', async (btnInteraction) => {
      try {
        await btnInteraction.deferUpdate();
        if (btnInteraction.customId.startsWith('percentage_')) {
          selectedPercentage = parseFloat(btnInteraction.customId.replace('percentage_', ''));
          selectionIndex = initiatingExitPercentages.indexOf(selectedPercentage);
          collector.stop();

          const percentageLabel = selectionIndex !== -1 ? `Level ${selectionIndex + 1}` : 'Custom percentage';

          // Prepare swap summary with "Swap Now" and "Cancel" buttons
          const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('swap_now')
              .setLabel('Swap Now')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('cancel_swap')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Danger)
          );

          await btnInteraction.editReply({
            content: `Preparing to sell ${selectedPercentage}% of your [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>) position.`,
            components: [actionRow],
          });

          const swapFilter = (i: any) =>
            i.user.id === initiatingUserId &&
            (i.customId === 'swap_now' || i.customId === 'cancel_swap');

          const swapCollector = interaction.channel?.createMessageComponentCollector({
            filter: swapFilter,
            componentType: ComponentType.Button,
            time: 5000, // 5 seconds to confirm
          });

          swapCollector?.on('collect', async (i) => {
            try {
              await i.deferUpdate(); // Defer the interaction

              if (i.customId === 'swap_now') {
                swapCollector.stop();

                await i.editReply({
                  content: `Executing swap...`,
                  components: [],
                });

                // Proceed to execute swaps for all connected wallets
                const tradeResults = [];

                const limit = pLimit(3); // Limit to 3 concurrent swaps

                await Promise.all(
                  connectedWallets.map(walletInfo =>
                    limit(async () => {
                      try {
                        const { user, wallet } = walletInfo;

                        // Fetch the wallet's settings
                        const walletSettings = user.wallets.find(w => w.publicKey === wallet.publicKey)?.settings
                          || user.settings  // User's default settings
                          || defaultSettings;
                        const userExitPercentages = walletSettings.exitPercentages || defaultSettings.exitPercentages;

                        // Map initiating user's selected percentage to this user's settings
                        const mappedPercentage = mapSelectionToUserSettings(
                          initiatingExitPercentages,
                          userExitPercentages,
                          selectionIndex
                        );

                        // Fetch token balance using rateLimitedRequest
                        const { balance: tokenBalance } = await getTokenBalance(wallet.publicKey, inputTokenAddress);

                        const decimals = inputTokenInfo.decimals;

                        if (typeof tokenBalance !== 'number' || isNaN(tokenBalance) || tokenBalance <= 0) {
                          console.log(`Invalid token balance for wallet ${wallet.publicKey}`);
                          return;
                        }

                        // Calculate amount to sell
                        const amount = tokenBalance * (mappedPercentage / 100);
                        const userAdjustedAmount = Math.floor(amount * Math.pow(10, decimals));

                        // Ensure adjustedAmount is valid
                        if (!Number.isFinite(userAdjustedAmount) || userAdjustedAmount <= 0) {
                          console.log(`Calculated adjusted amount is invalid for wallet ${wallet.publicKey}: ${userAdjustedAmount}`);
                          return;
                        }

                        // Skip if token balance is too low
                        if (tokenBalance < amount) {
                          console.log(`Token balance too low for wallet ${wallet.publicKey}`);
                          return;
                        }

                        // Create swap preview
                        const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
                          userAdjustedAmount,
                          inputTokenAddress,
                          outputToken,
                          walletSettings
                        );

// confirmation "swap now", and "cancel" button here. 


                        // Execute the swap for this user's wallet
                        const swapResult = await executeSwapForUser({
                          interaction,
                          user,
                          wallet,
                          selectedAmount: userAdjustedAmount,
                          settings: walletSettings,
                          outputTokenAddress: outputToken,
                          inputTokenAddress: inputTokenAddress,
                          isBuyOperation: false,
                          inputTokenInfo,
                          outputTokenInfo,
                          estimatedOutput: userEstimatedOutput,
                          initiatingUser,
                          quoteData: userQuoteData,
                        });

                        tradeResults.push({
                          user,
                          swapResult,
                          mappedPercentage,
                          estimatedOutput: userEstimatedOutput,
                          inputTokenInfo,
                          outputTokenInfo,
                        });
                      } catch (error) {
                        console.error(`Error executing swap for wallet ${walletInfo.wallet.publicKey}:`, error);
                      }
                    })
                  )
                );

                // Prepare public message
                const publicMessages = tradeResults.map((result) => {
                  const { user, swapResult, mappedPercentage, estimatedOutput, inputTokenInfo, outputTokenInfo } = result;
                  if (swapResult.success) {
                    return `${user.username || user.discordId} sold ${mappedPercentage}% of their ${inputTokenInfo.symbol} for ${estimatedOutput.toFixed(6)} ${outputTokenInfo.symbol}.`;
                  } else {
                    return `${user.username || user.discordId} attempted to sell but the transaction failed.`;
                  }
                });

                // Send public messages to the channel
                await interaction.channel?.send(`  **${initiatingUser.username || initiatingUser.discordId}** executed a sell order:\n` + publicMessages.join('\n'));
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
                if (i.replied || i.deferred) {
                  await i.editReply({
                    content: 'An error occurred during the swap execution.',
                    ephemeral: true,
                  });
                } else {
                  await i.editReply({
                    content: 'An error occurred during the swap execution.',
                    ephemeral: true,
                  });
                }
              } catch (followUpError) {
                console.error('Error sending follow-up message:', followUpError);
              }
            }
          });

          swapCollector?.on('end', async (_, reason) => {
            if (reason === 'time') {
              try {
                await interaction.editReply({
                  content: 'Transaction timed out.',
                  components: [],
                });
              } catch (error) {
                console.error('Error editing reply on timeout:', error);
              }
            }
          });

        } else if (btnInteraction.customId === 'cancel') {
          collector.stop();
          await btnInteraction.editReply({
            content: 'Transaction cancelled.',
            components: [],
          });
        } else if (btnInteraction.customId === 'custom') {
          collector.stop();
          await btnInteraction.editReply({
            content: 'Please enter a custom percentage (e.g., 25 for 25%):',
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
                  ephemeral: true,
                });
                return;
              }

              // Prepare swap summary with "Swap Now" and "Cancel" buttons
              const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('swap_now')
                  .setLabel('Swap Now')
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId('cancel_swap')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Danger)
              );

              await interaction.editReply({
                content: `You have selected to sell ${customPercentage}%. You have 30 seconds to confirm or cancel the swap.`,
                components: [actionRow],
                ephemeral: true,
              });

              const swapFilter = (i: any) =>
                i.user.id === initiatingUserId &&
                (i.customId === 'swap_now' || i.customId === 'cancel_swap');

              const swapCollector = interaction.channel?.createMessageComponentCollector({
                filter: swapFilter,
                componentType: ComponentType.Button,
                time: 5000, // 5 seconds to confirm
              });

              swapCollector?.on('collect', async (i) => {
                try {
                  if (i.customId === 'swap_now') {
                    swapCollector.stop();

                    await i.editReply({
                      content: 'Executing swap...',
                      components: [],
                    });

                    // Proceed to execute swaps for all connected wallets
                    const tradeResults = [];

                    const limit = pLimit(3); // Limit to 3 concurrent swaps

                    await Promise.all(
                      connectedWallets.map(walletInfo =>
                        limit(async () => {
                          try {
                            const { user, wallet } = walletInfo;

                            // Fetch the wallet's settings
                            const walletSettings = user.wallets.find(w => w.publicKey === wallet.publicKey)?.settings
                              || user.settings  // User's default settings
                              || defaultSettings;

                            // Use the custom percentage for all users
                            const mappedPercentage = customPercentage;

                            // Fetch token balance using rateLimitedRequest
                            const { balance: tokenBalance } = await getTokenBalance(wallet.publicKey, inputTokenAddress);

                            const decimals = inputTokenInfo.decimals;

                            if (typeof tokenBalance !== 'number' || isNaN(tokenBalance) || tokenBalance <= 0) {
                              console.log(`Invalid token balance for wallet ${wallet.publicKey}`);
                              return;
                            }

                            // Calculate amount to sell
                            const amount = tokenBalance * (mappedPercentage / 100);
                            const userAdjustedAmount = Math.floor(amount * Math.pow(10, decimals));

                            // Ensure adjustedAmount is valid
                            if (!Number.isFinite(userAdjustedAmount) || userAdjustedAmount <= 0) {
                              console.log(`Calculated adjusted amount is invalid for wallet ${wallet.publicKey}: ${userAdjustedAmount}`);
                              return;
                            }

                            // Skip if token balance is too low
                            if (tokenBalance < amount) {
                              console.log(`Token balance too low for wallet ${wallet.publicKey}`);
                              return;
                            }

                            // Create swap preview
                            const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
                              userAdjustedAmount,
                              inputTokenAddress,
                              outputToken,
                              walletSettings
                            );

                            // Execute the swap for this user's wallet
                            const swapResult = await executeSwapForUser({
                              interaction,
                              user,
                              wallet,
                              selectedAmount: userAdjustedAmount,
                              settings: walletSettings,
                              outputTokenAddress: outputToken,
                              inputTokenAddress: inputTokenAddress,
                              isBuyOperation: false,
                              inputTokenInfo,
                              outputTokenInfo,
                              estimatedOutput: userEstimatedOutput,
                              initiatingUser,
                              quoteData: userQuoteData,
                            });

                            tradeResults.push({
                              user,
                              swapResult,
                              mappedPercentage,
                              estimatedOutput: userEstimatedOutput,
                              inputTokenInfo,
                              outputTokenInfo,
                            });
                          } catch (error) {
                            console.error(`Error executing swap for wallet ${walletInfo.wallet.publicKey}:`, error);
                          }
                        })
                      )
                    );

                    // Prepare public message
                    const publicMessages = tradeResults.map((result) => {
                      const { user, swapResult, mappedPercentage, estimatedOutput, inputTokenInfo, outputTokenInfo } = result;
                      if (swapResult.success) {
                        return `${user.username || user.discordId} sold ${mappedPercentage}% of their ${inputTokenInfo.symbol} for ${estimatedOutput.toFixed(6)} ${outputTokenInfo.symbol}.`;
                      } else {
                        return `${user.username || user.discordId} attempted to sell but the transaction failed.`;
                      }
                    });

                    // Send public messages to the channel
                    await interaction.channel?.send(  `**${initiatingUser.username || initiatingUser.discordId}** executed a sell order:\n` + publicMessages.join('\n'));
                  } else if (i.customId === 'cancel_swap') {
                    swapCollector.stop();
                    await i.editReply({
                      content: 'Transaction cancelled.',
                      components: [],
                    });
                  }
                } catch (error) {
                  console.error('Error in swapCollector (custom percentage):', error);
                  await i.editReply({
                    content: 'An error occurred during the swap execution.',
                    ephemeral: true,
                  });
                }
              });

              swapCollector?.on('end', async (_, reason) => {
                if (reason === 'time') {
                  try {
                    await interaction.editReply({
                      content: 'Transaction timed out.',
                      ephemeral: true,
                    });
                  } catch (error) {
                    console.error('Error following up on timeout:', error);
                  }
                }
              });

            } catch (error) {
              console.error('Error collecting custom percentage:', error);
              await interaction.editReply({
                content: 'An error occurred while processing your custom percentage.',
                ephemeral: true,
              });
            }
          });

          messageCollector?.on('end', async (collected, reason) => {
            if (collected.size === 0) {
              try {
                await interaction.editReply({
                  content: 'No percentage entered. Transaction cancelled.',
                  ephemeral: true,
                });
              } catch (error) {
                console.error('Error following up on no percentage entered:', error);
              }
            }
          });
        }
      } catch (error) {
        console.error('Error in collector:', error);
        await btnInteraction.editReply({
          content: 'An error occurred while processing your selection.',
          ephemeral: true,
        });
      }
    });

    collector?.on('end', async () => {
      if (selectedPercentage === 0 && selectionIndex === -1) {
        try {
          await interaction.editReply({
            content: 'No percentage selected. Transaction cancelled.',
            components: [],
          });
        } catch (error) {
          console.error('Error editing reply on collector end:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error in handleSellCommand:', error);
    if (interaction.deferred || interaction.replied) {
      try {
        await interaction.editReply('An error occurred while processing the sell command.');
      } catch (err) {
        console.error('Error editing reply in catch block:', err);
      }
    } else {
      try {
        await interaction.editReply('An error occurred while processing the sell command.');
      } catch (err) {
        console.error('Error replying in catch block:', err);
      }
    }
  }
}