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
import { getQuote, getTokenInfo, getTokenBalance } from '../../src/services/jupiter.service';
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

        await btnInteraction.update({
          content: `You have chosen to sell **${selectedPercentage}%** of your **${inputTokenInfo.symbol}** balance.`,
          components: [],
        });

        // Proceed to execute swaps for all connected wallets
        for (const walletInfo of connectedWallets) {
          const { user, wallet } = walletInfo;
          const settings = user.settings || defaultSettings;
          const userExitPercentages = settings.exitPercentages || defaultSettings.exitPercentages;

          // Map initiating user's selected percentage to this user's settings
          const mappedPercentage = mapSelectionToUserSettings(
            initiatingExitPercentages,
            userExitPercentages,
            initiatingExitPercentages.indexOf(selectedPercentage)
          );

          // Fetch token balance
          const { balance: tokenBalance } = await getTokenBalance(wallet.publicKey, inputTokenAddress);
          const decimals = inputTokenInfo.decimals;

          // Log values for debugging
          console.log(`walletAddress, tokenAddress: ${wallet.publicKey}, ${inputTokenAddress}`);
          console.log(`balance, decimals: ${tokenBalance}, ${decimals}`);

          // Check for valid values
          if (typeof tokenBalance !== 'number' || isNaN(tokenBalance)) {
            // throw new Error(`Invalid token balance for wallet ${wallet.publicKey}`);
            console.log(`Invalid token balance for wallet ${wallet.publicKey}`);
            continue;
          }
          if (typeof mappedPercentage !== 'number' || isNaN(mappedPercentage)) {
            console.log(`Invalid mapped percentage for user ${user.discordId}`);
            continue;
            // throw new Error(`Invalid mapped percentage for user ${user.discordId}`);
          }
          if (typeof decimals !== 'number' || isNaN(decimals)) {
            console.log(`Invalid decimals for token ${inputTokenAddress}`);
            continue;
            // throw new Error(`Invalid decimals for token ${inputTokenAddress}`);
          }

          // Calculate amount to sell
          const amount = tokenBalance * (mappedPercentage / 100);
          const adjustedAmount = Math.floor(amount * Math.pow(10, decimals));

          // Ensure adjustedAmount is valid
          if (!Number.isFinite(adjustedAmount) || adjustedAmount <= 0) {
            throw new Error(`Calculated adjusted amount is invalid: ${adjustedAmount}`);
          }
          // Ensure adjustedAmount is an integer
          if (!Number.isInteger(adjustedAmount)) {
            throw new Error(`Adjusted amount must be an integer. Received: ${adjustedAmount}`);
          }

          // Create swap preview
          const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
            adjustedAmount,
            inputTokenAddress,
            outputToken,
            settings
          );

          // Execute the swap for this user's wallet
          await executeSwapForUser({
            interaction,
            user,
            wallet,
            selectedAmount: adjustedAmount,
            settings,
            outputTokenAddress: outputToken,
            inputTokenAddress: inputTokenAddress,
            isBuyOperation: false,
            inputTokenInfo,
            outputTokenInfo,
            estimatedOutput,
            initiatingUser,
            quoteData,
          });
        }
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