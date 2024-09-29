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
  executeSwap,
  recordTrade,
  swapTime,
  executeSwapTransaction
} from './swap-base';
import { Connection, PublicKey } from '@solana/web3.js';
import { rateLimitedRequest, getTokenInfo, getSwapTransaction, getTokenBalance } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { truncatedString } from '../../src/lib/utils';

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

export async function handleSellCommand(interaction: CommandInteraction) {
  const inputTokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  try {
    const user = await getUser(userId);
    const wallet = user.wallets[0];
    const outputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address

    const exitPercentages = user.settings.exitPercentages || defaultSettings.exitPercentages;
    const settings = user.settings || defaultSettings;

    // Fetch token balance and info
    let { balance: tokenBalance, decimals } = await getTokenBalance(wallet.publicKey, inputTokenAddress);
    const inputTokenInfo = await getTokenInfo(inputTokenAddress);
    const outputTokenInfo = outputToken==='So11111111111111111111111111111111111111112' ? await getTokenInfo(outputToken) : {"address":"So11111111111111111111111111111111111111112","name":"Wrapped SOL","symbol":"SOL","decimals":9,"logoURI":"https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png","tags":["verified","community","strict"],"daily_volume":112990735.53921615,"created_at":"2024-04-26T10:56:58.893768Z","freeze_authority":null,"mint_authority":null,"permanent_delegate":null,"minted_at":null,"extensions":{"coingeckoId":"wrapped-solana"}};

    if (tokenBalance === 0) {
      await interaction.editReply("You don't have any balance for this token.");
      return;
    }

    const buttons = exitPercentages.map(percentage => 
      new ButtonBuilder()
        .setCustomId(`percentage_${percentage}`)
        .setLabel(`${percentage}%`)
        .setStyle(ButtonStyle.Primary)
    );

    const customButton = new ButtonBuilder()
      .setCustomId('custom')
      .setLabel('Custom percentage')
      .setStyle(ButtonStyle.Secondary);

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(customButton, cancelButton));

    const response = await interaction.editReply({
      content: `Select your exit percentage for selling ${inputTokenInfo.symbol} ([${truncatedString(inputTokenAddress, 4)}](<https://solscan.io/token/${inputTokenAddress}>)):`,
      components: rows,
    });

    try {
      const collectorFilter = (i: { user: { id: string } }) => i.user.id === interaction.user.id;
      const confirmation = await response.awaitMessageComponent({
        filter: collectorFilter,
        // Remove the time limit or increase it significantly
        // time: 60000,
      });

      await confirmation.deferUpdate();

      if (confirmation.customId === 'cancel') {
        await interaction.editReply({ content: 'Sell order cancelled.', components: [] });
        return;
      }

      let exitPercentage: number;
      if (confirmation.customId === 'custom') {
        await interaction.editReply({
          content: 'Please enter the custom exit percentage (enter 20 for 20%):',
          components: [],
        });
        try {
          const customPercentageResponse = await interaction.channel!.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: 30000,
            errors: ['time'],
          });
          exitPercentage = parseFloat(customPercentageResponse.first()!.content);
          if (isNaN(exitPercentage) || exitPercentage <= 0 || exitPercentage > 100) {
            await interaction.editReply({
              content: 'Invalid percentage. Sell order cancelled.',
              components: [],
            });
            return;
          }
        } catch (error) {
          await interaction.editReply({
            content: 'No percentage provided. Sell order cancelled.',
            components: [],
          });
          return;
        }
      } else {
        exitPercentage = parseFloat(confirmation.customId.split('_')[1]);
      }

      const amount = tokenBalance * (exitPercentage / 100);
      const adjustedAmount = Math.floor(amount * 10 ** decimals);

      await interaction.editReply({
        content: `You have chosen to sell **${exitPercentage}%** of your **${inputTokenInfo.symbol}** balance.`,
        components: [],
      });

      const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
        adjustedAmount,
        inputTokenAddress,
        outputToken,
        settings
      );

      const executeButton = new ButtonBuilder()
        .setCustomId('execute_swap')
        .setLabel('Swap Now')
        .setStyle(ButtonStyle.Primary);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_swap')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger);

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(executeButton, cancelButton);
      const fiveSecondsFromNow = Math.floor(Date.now() / 1000) + 8;
      await interaction.editReply({
        content: `${swapPreview}\n\nSubmitting swap in 5 seconds.\nClick 'Swap Now' to proceed immediately, or 'Cancel' to abort.`,
        components: [buttonRow],
      });

      try {
        const buttonCollector = (await interaction.fetchReply()).createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 5000, // Set to 5 seconds
        });

        let transactionCancelled = false;
        let transactionExecuted = false;

        buttonCollector.on('collect', async (btnInteraction) => {
          if (btnInteraction.user.id === userId) {
            if (btnInteraction.customId === 'cancel_swap') {
              transactionCancelled = true;
              buttonCollector.stop();
              await btnInteraction.update({
                content: 'Transaction cancelled.',
                components: [],
              });
            } else if (btnInteraction.customId === 'execute_swap') {
              transactionExecuted = true;
              buttonCollector.stop();
              await btnInteraction.update({
                content: 'Processing your swap...',
                components: [],
              });
              await executeSwapTransaction(
                interaction,
                userId,
                wallet,
                quoteData,
                settings,
                amount,
                inputTokenAddress,
                outputToken,
                inputTokenInfo,
                outputTokenInfo,
                estimatedOutput,
                false, // isBuyOperation
                ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌'],
                exitPercentages
              );
            }
          } else {
            await btnInteraction.reply({ content: 'You cannot use this button.', ephemeral: true });
          }
        });

        buttonCollector.on('end', async (collected) => {
          if (!transactionCancelled && !transactionExecuted) {
            // If no button was pressed, execute the swap automatically
            await interaction.editReply({
              content: 'Processing your swap...',
              components: [],
            });
            await executeSwapTransaction(
              interaction,
              userId,
              wallet,
              quoteData,
              settings,
              amount,
              inputTokenAddress,
              outputToken,
              inputTokenInfo,
              outputTokenInfo,
              estimatedOutput,
              false, // isBuyOperation
              ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌'],
              exitPercentages
            );
          }
        });

      } catch (error) {
        console.error('Error in button collector:', error);
        await interaction.followUp({
          content: 'An error occurred while processing your sell order.',
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('Sell order timed out or was cancelled:', error);
      await interaction.editReply({
        content: 'Sell order timed out or was cancelled. Please try again.',
        components: [],
      });
    }
  } catch (error) {
    console.error('Error in handleSellCommand:', error);
    await interaction.editReply({
      content: 'An error occurred while processing your sell order.',
      components: [],
    });
  }
}
