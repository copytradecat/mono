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

        await btnInteraction.update({
          content: `You have chosen to buy **${selectedAmount} SOL** worth of **${outputTokenInfo.symbol}**.`,
          components: [],
        });

        const tradeResults = [];

        // Proceed to execute swaps for all connected wallets
        for (const walletInfo of connectedWallets) {
          const { user, wallet } = walletInfo;
          const settings = user.settings || defaultSettings;
          const userEntryAmounts = settings.entryAmounts || [0.05, 0.1, 0.25, 0.5, 1];

          // Map initiating user's selected amount to this user's settings
          const mappedAmount = mapSelectionToUserSettings(
            initiatingEntryAmounts,
            userEntryAmounts,
            initiatingEntryAmounts.indexOf(selectedAmount)
          );

          const adjustedAmount = Math.floor(mappedAmount * 10 ** inputTokenInfo.decimals);

          // Create swap preview
          const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
            adjustedAmount,
            inputToken,
            outputTokenAddress,
            settings
          );

          // Execute the swap for this user's wallet
          const swapResult = await executeSwapForUser({
            interaction,
            user,
            wallet,
            selectedAmount: adjustedAmount,
            settings,
            outputTokenAddress,
            inputTokenAddress: inputToken,
            isBuyOperation: true,
            inputTokenInfo,
            outputTokenInfo,
            estimatedOutput,
            initiatingUser,
            quoteData,
          });

          tradeResults.push({
            user,
            swapResult,
            mappedAmount,
            estimatedOutput,
            inputTokenInfo,
            outputTokenInfo,
          });
        }

        // Prepare public message
        const publicMessages = tradeResults.map((result) => {
          const { user, swapResult, mappedAmount, estimatedOutput, inputTokenInfo, outputTokenInfo } = result;
          const rate = (mappedAmount / 10 ** inputTokenInfo.decimals) / estimatedOutput;
          const selectionIndex = user.settings.entryAmounts.indexOf(mappedAmount / 10 ** inputTokenInfo.decimals);

          if (swapResult.success) {
            return `${user.username || user.discordId} bought a ${selectionIndex !== -1 ? `Level ${selectionIndex + 1}` : 'Custom amount'} of ${outputTokenInfo.symbol} at rate ${rate.toFixed(6)}.`;
          } else {
            return `${user.username || user.discordId} attempted to buy but the transaction failed.`;
          }
        });

        // Send public messages to the channel
        await interaction.channel?.send(publicMessages.join('\n'));

      } else if (btnInteraction.customId === 'cancel') {
        collector.stop();
        await btnInteraction.update({
          content: 'Transaction cancelled.',
          components: [],
        });
      } else if (btnInteraction.customId === 'custom') {
        collector.stop();
        await btnInteraction.update({
          content: 'Please enter a custom amount (in SOL):',
          components: [],
        });
        // Handle custom amount input...
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