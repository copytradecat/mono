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
import { getConnectedWalletsInChannel, mapSelectionToUserSettings } from './utils';

export async function handleSellCommand(interaction: CommandInteraction) {
  const inputTokenAddress = interaction.options.getString('token', true);
  const initiatingUserId = interaction.user.id;
  const channelId = interaction.channelId;

  await interaction.deferReply({ ephemeral: true });

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
      content: 'Select the percentage of your balance you wish to sell:',
      components: buttonRows,
    });

    const filter = (btnInteraction: any) => btnInteraction.user.id === initiatingUserId;

    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      componentType: ComponentType.Button,
      time: 15000,
    });

    let selectedPercentage: number = 0;

    collector?.on('collect', async (btnInteraction) => {
      if (btnInteraction.customId.startsWith('percentage_')) {
        selectedPercentage = parseFloat(btnInteraction.customId.replace('percentage_', ''));
        collector.stop();

        // Map initiating user's selected percentage to their settings index
        const selectionIndex = initiatingExitPercentages.indexOf(selectedPercentage);

        // Calculate amount based on initiating user's wallet balance
        const { balance: initiatingBalance } = await getTokenBalance(initiatingWallet.publicKey, inputTokenAddress);
        const amountToSell = (initiatingBalance * selectedPercentage) / 100;
        const adjustedAmount = Math.floor(amountToSell * 10 ** inputTokenInfo.decimals);

        // Create swap preview
        const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
          adjustedAmount,
          inputTokenAddress,
          outputToken,
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
              const userExitPercentages = settings.exitPercentages || defaultSettings.exitPercentages;

              // Map initiating user's selected percentage to this user's settings
              const mappedPercentage = mapSelectionToUserSettings(
                initiatingExitPercentages,
                userExitPercentages,
                selectionIndex
              );

              // Fetch token balance
              const { balance: tokenBalance } = await getTokenBalance(wallet.publicKey, inputTokenAddress);
              const decimals = inputTokenInfo.decimals;

              if (typeof tokenBalance !== 'number' || isNaN(tokenBalance) || tokenBalance <= 0) {
                console.log(`Invalid token balance for wallet ${wallet.publicKey}`);
                continue;
              }

              // Calculate amount to sell
              const amount = tokenBalance * (mappedPercentage / 100);
              const userAdjustedAmount = Math.floor(amount * Math.pow(10, decimals));

              // Ensure adjustedAmount is valid
              if (!Number.isFinite(userAdjustedAmount) || userAdjustedAmount <= 0) {
                console.log(`Calculated adjusted amount is invalid for wallet ${wallet.publicKey}: ${userAdjustedAmount}`);
                continue;
              }

              // Create swap preview
              const { quoteData: userQuoteData, estimatedOutput: userEstimatedOutput } = await createSwapPreview(
                userAdjustedAmount,
                inputTokenAddress,
                outputToken,
                settings
              );

              // Execute the swap for this user's wallet
              const swapResult = await executeSwapForUser({
                interaction,
                user,
                wallet,
                selectedAmount: userAdjustedAmount,
                settings,
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
            }

            // Prepare public message
            const publicMessages = tradeResults.map((result) => {
              const { user, swapResult, mappedPercentage, estimatedOutput, inputTokenInfo, outputTokenInfo } = result;
              const rate = (estimatedOutput) / ((mappedPercentage / 100) * tokenBalance);

              if (swapResult.success) {
                return `${user.username || user.discordId} sold ${(mappedPercentage).toFixed(2)}% of their ${inputTokenInfo.symbol} for ${estimatedOutput.toFixed(outputTokenInfo.decimals)} ${outputTokenInfo.symbol} at rate ${rate.toFixed(6)}.`;
              } else {
                return `${user.username || user.discordId} attempted to sell but the transaction failed.`;
              }
            });

            // Send public messages to the channel
            await interaction.channel?.send(`**${initiatingUser.username || initiatingUser.discordId}** executed a sell order:\n` + publicMessages.join('\n'));

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
        await btnInteraction.update({
          content: 'Please enter a custom percentage:',
          components: [],
        });
        // Handle custom percentage input...
      }
    });

    collector?.on('end', async () => {
      if (selectedPercentage === 0) {
        await interaction.editReply({
          content: 'No percentage selected. Transaction cancelled.',
          components: [],
        });
      }
    });
  } catch (error) {
    console.error('Error in handleSellCommand:', error);
    await interaction.editReply({
      content: 'An error occurred while processing the sell order.',
      components: [],
    });
  }
}