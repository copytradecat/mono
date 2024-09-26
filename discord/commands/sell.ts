import {
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from 'discord.js';
import { getSwapTransaction } from '../../src/services/jupiter.service';
import {
  getUser,
  createSwapPreview,
  executeSwap,
  recordTrade,
  swapTime,
} from './swap-base';
import { Connection, PublicKey } from '@solana/web3.js';
import { rateLimitedRequest, getTokenInfo } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';

const EXIT_PERCENTAGES = [25, 50, 100]; // Adjust as needed

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

export async function handleSellCommand(interaction: CommandInteraction) {
  const tokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  try {
    const user = await getUser(userId);
    const wallet = user.wallets[0];
    const outputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address

    const exitPercentages = user.settings.exitPercentages || EXIT_PERCENTAGES;
    const settings = user.settings || defaultSettings;

    // Fetch token balance and info
    const { balance: tokenBalance, decimals } = await getTokenBalance(wallet.publicKey, tokenAddress);
    const tokenInfo = await getTokenInfo(tokenAddress);

    if (tokenBalance === 0) {
      await interaction.editReply("You don't have any balance for this token.");
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('exit_percentage')
      .setPlaceholder('Select your exit percentage')
      .addOptions(
        exitPercentages.map((percentage) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${percentage}% of your balance`)
            .setValue(percentage.toString())
        )
      )
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('Custom percentage').setValue('custom'),
        new StringSelectMenuOptionBuilder().setLabel('Cancel').setValue('cancel'),
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const response = await interaction.editReply({
      content: `Select your exit percentage for selling ${tokenInfo.symbol}:`,
      components: [row],
    });

    try {
      const collectorFilter = (i: { user: { id: string } }) => i.user.id === interaction.user.id;
      const confirmation = await response.awaitMessageComponent({
        filter: collectorFilter,
        time: 60000,
      });

      if (confirmation.customId === 'exit_percentage') {
        await confirmation.deferUpdate();

        if (confirmation.values[0] === 'cancel') {
          await interaction.followUp({ content: 'Sell order cancelled.', ephemeral: true });
          return;
        }

        let exitPercentage: number;
        if (confirmation.values[0] === 'custom') {
          await interaction.followUp({
            content: 'Please enter the custom exit percentage:',
            ephemeral: true,
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
              await interaction.followUp({
                content: 'Invalid percentage. Sell order cancelled.',
                ephemeral: true,
              });
              return;
            }
          } catch (error) {
            await interaction.followUp({
              content: 'No percentage provided. Sell order cancelled.',
              ephemeral: true,
            });
            return;
          }
        } else {
          exitPercentage = parseFloat(confirmation.values[0]);
        }

        const amount = tokenBalance * (exitPercentage / 100);
        const adjustedAmount = Math.floor(amount * 10 ** decimals);

        // Remove the selection menu
        await interaction.editReply({
          content: `You have chosen to sell **${exitPercentage}%** of your **${tokenInfo.symbol}** balance.`,
          components: [],
        });

        const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
          adjustedAmount,
          tokenAddress,
          outputToken,
          settings
        );

        // Create a cancel button
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_swap')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton);

        // Send the swap preview (ephemeral) with the cancel button
        const swapPreviewMessage = await interaction.followUp({
          content: swapPreview,
          components: [buttonRow],
          ephemeral: true,
        });

        // Set up an interaction collector for the cancel button
        const buttonCollector = swapPreviewMessage.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: swapTime,
        });

        let transactionCancelled = false;

        buttonCollector.on('collect', async (btnInteraction) => {
          if (btnInteraction.customId === 'cancel_swap' && btnInteraction.user.id === userId) {
            transactionCancelled = true;
            buttonCollector.stop();
            await btnInteraction.reply({ content: 'Transaction cancelled.', ephemeral: true });
          } else {
            await btnInteraction.reply({ content: 'You cannot use this button.', ephemeral: true });
          }
        });

        buttonCollector.on('end', async () => {
          // Remove the cancel button
          await swapPreviewMessage.edit({
            content: swapPreview,
            components: [],
          });

          if (transactionCancelled) {
            // Transaction was cancelled by the user
            return;
          } else {
            // Proceed with executing the swap
            try {
              const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
              console.log('Swap Data:', swapData);

              const swapResult = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);
              if (swapResult.success) {
                await recordTrade(userId, wallet.publicKey, swapResult.signature, amount, tokenAddress);

                const successMessage = `**${interaction.user.username}** sold **${(
                  amount
                )} ${tokenInfo.symbol}** for **${estimatedOutput} SOL**.
Transaction ID: ${swapResult.signature}`;

                await interaction.channel?.send(successMessage);
              } else {
                const errorMessage = `Failed to execute sell order. Reason: ${swapResult.transactionMessage}`;
                await interaction.followUp({ content: errorMessage, ephemeral: true });
              }
            } catch (error) {
              console.error('Error executing swap:', error);
              await interaction.followUp({
                content: 'Failed to execute sell order. Please try again later.',
                ephemeral: true,
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('Sell order timed out or was cancelled:', error);
      await interaction.followUp({
        content: 'Sell order timed out or was cancelled. Please try again.',
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in handleSellCommand:', error);
    await interaction.followUp({
      content: 'An error occurred while processing your sell order.',
      ephemeral: true,
    });
  }
}

// Helper function to get token balance and decimals
async function getTokenBalance(walletAddress: string, tokenAddress: string): Promise<{
  balance: number;
  decimals: number;
}> {
  const walletPublicKey = new PublicKey(walletAddress);
  const tokenPublicKey = new PublicKey(tokenAddress);

  const tokenAccounts = await rateLimitedRequest(() =>
    connection.getParsedTokenAccountsByOwner(walletPublicKey, {
      mint: tokenPublicKey,
    })
  );

  if (tokenAccounts.value.length === 0) {
    return { balance: 0, decimals: 0 };
  }

  const tokenAccount = tokenAccounts.value[0].account.data.parsed.info;
  const balance = parseFloat(tokenAccount.tokenAmount.uiAmount);
  const decimals = tokenAccount.tokenAmount.decimals;

  return { balance, decimals };
}