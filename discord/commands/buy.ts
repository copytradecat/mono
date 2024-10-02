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
import {
  getTokenInfo,
  getTokenBalance,
  getBalancesForWallets,
} from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import {
  truncatedString,
  getConnectedWalletsInChannel,
  mapSelectionToUserSettings,
} from '../../src/lib/utils';
import pLimit from 'p-limit';

export async function handleBuyCommand(interaction: CommandInteraction) {
  const outputTokenAddress = interaction.options.getString('token', true);
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
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputToken);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);
    const initiatingEntryAmounts = initiatingUser.settings.entryAmounts || defaultSettings.entryAmounts;
    const initiatingSettings = initiatingUser.settings || defaultSettings;

    // Fetch all connected wallets in this channel
    const connectedWallets = await getConnectedWalletsInChannel(channelId);

    // Combine amount buttons with custom and cancel buttons
    const buttons = initiatingEntryAmounts.map((amount) =>
      new ButtonBuilder()
        .setCustomId(`amount_${amount}`)
        .setLabel(`${amount} SOL`)
        .setStyle(ButtonStyle.Primary)
    );

    // Add custom and cancel buttons
    buttons.push(
      new ButtonBuilder()
        .setCustomId('custom')
        .setLabel('Custom amount')
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
      content: `Select the amount of ${outputTokenInfo.symbol} ([${truncatedString(outputTokenAddress, 4)}](<https://solscan.io/token/${outputTokenAddress}>)) you wish to buy:`,
      components: buttonRows,
    });

    const filter = (btnInteraction: any) => btnInteraction.user.id === initiatingUserId;

    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      componentType: ComponentType.Button,
      time: 30000, // 30 seconds to make a selection
    });

    let selectedAmount: number = 0;
    let selectionIndex: number = -1; // Keep track of the index

    collector?.on('collect', async (btnInteraction) => {
      try {
        await btnInteraction.deferUpdate(); // Defer the interaction

        if (btnInteraction.customId.startsWith('amount_')) {
          selectedAmount = parseFloat(btnInteraction.customId.replace('amount_', ''));
          selectionIndex = initiatingEntryAmounts.indexOf(selectedAmount);
          collector.stop();

          const amountLabel = selectionIndex !== -1 ? `Level ${selectionIndex + 1}` : 'Custom amount';

          // Create swap preview
          const adjustedAmount = Math.floor(selectedAmount * 10 ** inputTokenInfo.decimals);

          const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
            adjustedAmount,
            inputToken,
            outputTokenAddress,
            initiatingSettings
          );

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
            content: `**Swap Summary:**\n${swapPreview}\n\nSubmitting swap in 5 seconds.\nClick 'Swap Now' to proceed immediately, or 'Cancel' to abort.`,
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
                  content: `Processing swaps...`,
                  components: [],
                });

                // Proceed to execute swaps for all connected wallets
                const tradeResults = [];

                // Fetch SOL balances for all wallets concurrently
                const walletPublicKeys = connectedWallets.map(w => w.wallet.publicKey);

                // Use the updated getBalancesForWallets function
                const solBalances = await getBalancesForWallets(walletPublicKeys, inputToken);

                const limit = pLimit(3); // Limit to 3 concurrent swaps

                await Promise.all(
                  connectedWallets.map(walletInfo =>
                    limit(async () => {
                      try {
                        const { user, wallet } = walletInfo;
                        const walletPublicKey = wallet.publicKey;

                        // Fetch the wallet's settings
                        const walletSettings = user.wallets.find(w => w.publicKey === walletPublicKey)?.settings
                          || user.settings  // User's default settings
                          || defaultSettings;
                        const userEntryAmounts = walletSettings.entryAmounts || defaultSettings.entryAmounts;

                        // Map initiating user's selected amount to this user's settings
                        const mappedAmount = mapSelectionToUserSettings(
                          initiatingEntryAmounts,
                          userEntryAmounts,
                          selectionIndex,
                        );

                        // Check user's SOL balance
                        const userSolBalance = solBalances[walletPublicKey]; // In SOL units

                        const requiredAmount = mappedAmount;

                        // Estimate transaction fee (Set a standard fee or fetch estimate)
                        const estimatedFee = 0.000005; // Approximate fee

                        if (userSolBalance < requiredAmount + estimatedFee) {
                          console.log(`Insufficient SOL balance for wallet ${walletPublicKey}`);
                          const userDiscord = await interaction.client.users.fetch(user.discordId);
                          await userDiscord.send({
                            content: `Insufficient SOL balance in wallet ${truncatedString(walletPublicKey, 4)}. Required: ${(requiredAmount + estimatedFee).toFixed(6)} SOL, Available: ${userSolBalance.toFixed(6)} SOL.`,
                          });
                          return;
                        }

                        // Proceed to create swap preview and execute swap
                        const adjustedAmount = Math.floor(mappedAmount * 10 ** inputTokenInfo.decimals);

                        const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
                          adjustedAmount,
                          inputToken,
                          outputTokenAddress,
                          walletSettings
                        );

                        const swapResult = await executeSwapForUser({
                          interaction,
                          user,
                          wallet,
                          selectedAmount: adjustedAmount,
                          settings: walletSettings,
                          outputTokenAddress,
                          inputTokenAddress: inputToken,
                          isBuyOperation: true,
                          inputTokenInfo,
                          outputTokenInfo,
                          estimatedOutput: userEstimatedOutput,
                          initiatingUser,
                          quoteData: userQuoteData,
                        });

                        tradeResults.push({
                          user,
                          swapResult,
                          mappedAmount,
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
                  const { user, swapResult, mappedAmount, estimatedOutput, inputTokenInfo, outputTokenInfo } = result;
                  const rate = (mappedAmount / 10 ** inputTokenInfo.decimals) / estimatedOutput;

                  if (swapResult.success) {
                    return `${user.username || user.discordId} bought ${estimatedOutput.toFixed(6)} ${outputTokenInfo.symbol} using ${(mappedAmount / 10 ** inputTokenInfo.decimals).toFixed(6)} ${inputTokenInfo.symbol} at rate ${rate.toFixed(6)}.`;
                  } else {
                    return `${user.username || user.discordId} attempted to buy but the transaction failed.`;
                  }
                });

                // Send public messages to the channel
                await interaction.channel?.send(`  **${initiatingUser.username || initiatingUser.discordId}** executed a buy order:\n` + publicMessages.join('\n'));
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
                  ephemeral: true,
                });
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
                  ephemeral: true,
                });
                return;
              }

              // Proceed to create swap preview with customAmount
              const adjustedAmount = Math.floor(customAmount * 10 ** inputTokenInfo.decimals);

              const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
                adjustedAmount,
                inputToken,
                outputTokenAddress,
                initiatingSettings
              );

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
                content: `Swap Summary:\n${swapPreview}\n\nYou have 5 seconds to confirm or cancel the swap.`,
                components: [actionRow],
                ephemeral: true,
              });

              // Set up a collector for swap confirmation
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
                      content: 'Processing swaps...',
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

                            // Use the custom amount for all users
                            const mappedAmount = customAmount;

                            const userAdjustedAmount = Math.floor(mappedAmount * 10 ** inputTokenInfo.decimals);

                            // Create swap preview for this user
                            const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
                              userAdjustedAmount,
                              inputToken,
                              outputTokenAddress,
                              walletSettings
                            );

                            // Execute the swap for this user's wallet
                            const swapResult = await executeSwapForUser({
                              interaction,
                              user,
                              wallet,
                              selectedAmount: userAdjustedAmount,
                              settings: walletSettings,
                              outputTokenAddress,
                              inputTokenAddress: inputToken,
                              isBuyOperation: true,
                              inputTokenInfo,
                              outputTokenInfo,
                              estimatedOutput: userEstimatedOutput,
                              initiatingUser,
                              quoteData: userQuoteData,
                            });

                            tradeResults.push({
                              user,
                              swapResult,
                              mappedAmount,
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
                      const { user, swapResult, mappedAmount, estimatedOutput, inputTokenInfo, outputTokenInfo } = result;
                      const rate = mappedAmount / estimatedOutput;

                      if (swapResult.success) {
                        return `${user.username || user.discordId} bought ${estimatedOutput.toFixed(6)} ${outputTokenInfo.symbol} using ${mappedAmount.toFixed(6)} ${inputTokenInfo.symbol} at rate ${rate.toFixed(6)}.`;
                      } else {
                        return `${user.username || user.discordId} attempted to buy but the transaction failed.`;
                      }
                    });

                    // Send public messages to the channel
                    await interaction.channel?.send(`**${initiatingUser.username || initiatingUser.discordId}** executed a buy order:\n` + publicMessages.join('\n'));
                  } else if (i.customId === 'cancel_swap') {
                    swapCollector.stop();
                    await i.editReply({
                      content: 'Transaction cancelled.',
                      components: [],
                    });
                  }
                } catch (error) {
                  console.error('Error in swapCollector (custom amount):', error);
                  try {
                    await i.editReply({
                      content: 'An error occurred during the swap execution.',
                      ephemeral: true,
                    });
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
                      ephemeral: true,
                    });
                  } catch (error) {
                    console.error('Error following up on timeout:', error);
                  }
                }
              });

            } catch (error) {
              console.error('Error collecting custom amount:', error);
              await interaction.editReply({
                content: 'An error occurred while processing your custom amount.',
                ephemeral: true,
              });
            }
          });

          messageCollector?.on('end', async (collected, reason) => {
            if (collected.size === 0) {
              try {
                await interaction.editReply({
                  content: 'No amount entered. Transaction cancelled.',
                  ephemeral: true,
                });
              } catch (error) {
                console.error('Error following up on no amount entered:', error);
              }
            }
          });

        }
      } catch (error) {
        console.error('Error in collector:', error);
        try {
          await btnInteraction.editReply({
            content: 'An error occurred while processing your selection.',
            ephemeral: true,
          });
        } catch (followUpError) {
          console.error('Error sending follow-up message:', followUpError);
        }
      }
    });

    collector?.on('end', async () => {
      if (selectedAmount === 0 && selectionIndex === -1) {
        try {
          await interaction.editReply({
            content: 'No amount selected. Transaction cancelled.',
            components: [],
          });
        } catch (error) {
          console.error('Error editing reply on collector end:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error in handleBuyCommand:', error);
    if (interaction.deferred || interaction.replied) {
      try {
        await interaction.editReply('An error occurred while processing the buy command.');
      } catch (err) {
        console.error('Error editing reply in catch block:', err);
      }
    } else {
      try {
        await interaction.editReply('An error occurred while processing the buy command.');
      } catch (err) {
        console.error('Error replying in catch block:', err);
      }
    }
  }
}