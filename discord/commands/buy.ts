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
import { getConnectedWalletsInChannel, mapSelectionToUserSettings } from './utils';L

export async function handleBuyCommand(interaction: CommandInteraction) {
  const outputTokenAddress = interaction.options.getString('token', true);
  const initiatingUserId = interaction.user.id;
  const channelId = interaction.channelId;

  await interaction.deferReply({ ephemeral: true });

  try {
    const initiatingUser = await getUser(initiatingUserId);
    const initiatingWallet = initiatingUser.wallets[0];
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputToken);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);
    const initiatingEntryAmounts = initiatingUser.settings.entryAmounts || [0.05, 0.1, 0.25, 0.5, 1];
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
      content: 'Select the amount you wish to buy:',
      components: buttonRows,
    });

    const filter = (btnInteraction: any) => btnInteraction.user.id === initiatingUserId;

    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      componentType: ComponentType.Button,
      time: 15000,
    });

    let selectedAmount: number = 0;

    collector?.on('collect', async (btnInteraction) => {
      if (btnInteraction.customId.startsWith('amount_')) {
        selectedAmount = parseFloat(btnInteraction.customId.replace('amount_', ''));
        collector.stop();

        // Map initiating user's selected amount to their settings index
        const selectionIndex = initiatingEntryAmounts.indexOf(selectedAmount);
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

        await interaction.editReply({
          content: `Swap Summary:\n${swapPreview}\n\nYou have 5 seconds to cancel or confirm the swap.`,
          components: [actionRow],
        });

        const swapFilter = (i: any) =>
          i.user.id === initiatingUserId &&
          (i.customId === 'swap_now' || i.customId === 'cancel_swap');

        const swapCollector = interaction.channel?.createMessageComponentCollector({
          filter: swapFilter,
          componentType: ComponentType.Button,
          time: 5000,
        });

        swapCollector?.on('collect', async (i) => {
          if (i.customId === 'swap_now') {
            swapCollector.stop();

            await i.update({
              content: `Executing swap...`,
              components: [],
            });

            // Proceed to execute swaps for all connected wallets
            const tradeResults = [];

            for (const walletInfo of connectedWallets) {
              const { user, wallet } = walletInfo;
              const settings = user.settings || defaultSettings;
              const userEntryAmounts = settings.entryAmounts || [0.05, 0.1, 0.25, 0.5, 1];

              // Map initiating user's selected amount to this user's settings
              const mappedAmount = mapSelectionToUserSettings(
                initiatingEntryAmounts,
                userEntryAmounts,
                selectionIndex
              );

              const userAdjustedAmount = Math.floor(mappedAmount * 10 ** inputTokenInfo.decimals);

              // Create swap preview for this user
              const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
                userAdjustedAmount,
                inputToken,
                outputTokenAddress,
                settings
              );

              // Execute the swap for this user's wallet
              const swapResult = await executeSwapForUser({
                interaction,
                user,
                wallet,
                selectedAmount: userAdjustedAmount,
                settings,
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
            }

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
            await interaction.channel?.send(`**${initiatingUser.username || initiatingUser.discordId}** executed a buy order:\n` + publicMessages.join('\n'));

          } else if (i.customId === 'cancel_swap') {
            swapCollector.stop();
            await i.update({
              content: 'Transaction cancelled.',
              components: [],
            });
          }
        });

        swapCollector?.on('end', async (_, reason) => {
          if (reason === 'time') {
            await interaction.editReply({
              content: 'Transaction timed out.',
              components: [],
            });
          }
        });

      } else if (btnInteraction.customId === 'cancel') {
        collector.stop();
        await btnInteraction.update({
          content: 'Transaction cancelled.',
          components: [],
        });
      } else if (btnInteraction.customId === 'custom') {
        collector.stop();

        // Prompt the user to enter a custom amount
        await btnInteraction.update({
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
          const input = message.content.trim();
          const customAmount = parseFloat(input);
          if (isNaN(customAmount) || customAmount <= 0) {
            await interaction.followUp({
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

          await interaction.followUp({
            content: `Swap Summary:\n${swapPreview}\n\nYou have 5 seconds to cancel or confirm the swap.`,
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
            time: 5000,
          });

          swapCollector?.on('collect', async (i) => {
            if (i.customId === 'swap_now') {
              swapCollector.stop();

              await i.update({
                content: 'Executing swap...',
                components: [],
              });

              // Proceed to execute swaps for all connected wallets
              const tradeResults = [];

              for (const walletInfo of connectedWallets) {
                const { user, wallet } = walletInfo;
                const settings = user.settings || defaultSettings;
                const userEntryAmounts = settings.entryAmounts || initiatingEntryAmounts;

                // Use the custom amount for all users
                const mappedAmount = customAmount;

                const userAdjustedAmount = Math.floor(mappedAmount * 10 ** inputTokenInfo.decimals);

                // Create swap preview for this user
                const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
                  userAdjustedAmount,
                  inputToken,
                  outputTokenAddress,
                  settings
                );

                // Execute the swap for this user's wallet
                const swapResult = await executeSwapForUser({
                  interaction,
                  user,
                  wallet,
                  selectedAmount: userAdjustedAmount,
                  settings,
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
              }

              // Prepare public message
              const publicMessages = tradeResults.map((result) => {
                const { user, swapResult, mappedAmount, estimatedOutput, inputTokenInfo, outputTokenInfo } = result;
                const rate = mappedAmount / estimatedOutput;

                if (swapResult.success) {
                  return `${user.username || user.discordId} bought ${estimatedOutput.toFixed(6)} ${outputTokenInfo.symbol} using ${mappedAmount.toFixed(outputTokenInfo.decimals)} ${inputTokenInfo.symbol} at rate ${rate.toFixed(6)}.`;
                } else {
                  return `${user.username || user.discordId} attempted to buy but the transaction failed.`;
                }
              });

              // Send public messages to the channel
              await interaction.channel?.send(`**${initiatingUser.username || initiatingUser.discordId}** executed a buy order:\n` + publicMessages.join('\n'));

            } else if (i.customId === 'cancel_swap') {
              swapCollector.stop();
              await i.update({
                content: 'Transaction cancelled.',
                components: [],
              });
            }
          });

          swapCollector?.on('end', async (_, reason) => {
            if (reason === 'time') {
              await interaction.followUp({
                content: 'Transaction timed out.',
                ephemeral: true,
              });
            }
          });
        });

        messageCollector?.on('end', async (collected, reason) => {
          if (collected.size === 0) {
            await interaction.followUp({
              content: 'No amount entered. Transaction cancelled.',
              ephemeral: true,
            });
          }
        });
      }
    });

    collector?.on('end', async () => {
      if (selectedAmount === 0) {
        await interaction.editReply({
          content: 'No amount selected. Transaction cancelled.',
          components: [],
        });
      }
    });
  } catch (error) {
    console.error('Error in handleBuyCommand:', error);
    await interaction.editReply({
      content: 'An error occurred while processing the buy order.',
      components: [],
    });
  }
}