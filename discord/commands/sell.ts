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
} from './swap-base';
import { Connection, PublicKey } from '@solana/web3.js';
import { rateLimitedRequest, getTokenInfo, getSwapTransaction, getTokenBalance } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { truncatedString } from '../../src/lib/utils';

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
const EXIT_PERCENTAGES = [25, 50, 75, 100]; // Adjust as needed

export async function handleSellCommand(interaction: CommandInteraction) {
  const inputTokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  try {
    const user = await getUser(userId);
    const wallet = user.wallets[0];
    const outputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address

    const exitPercentages = user.settings.exitPercentages || EXIT_PERCENTAGES;
    const settings = user.settings || defaultSettings;

    // Fetch token balance and info
    const { balance: tokenBalance, decimals } = await getTokenBalance(wallet.publicKey, inputTokenAddress);
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
        time: 60000,
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

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_swap')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger);

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton);

      await interaction.editReply({
        content: `${swapPreview}\n\nClick cancel within 5 seconds to cancel the swap.`,
        components: [buttonRow],
      });

      try {
        const buttonCollector = (await interaction.fetchReply()).createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: swapTime,
        });

        let transactionCancelled = false;

        buttonCollector.on('collect', async (btnInteraction) => {
          if (btnInteraction.customId === 'cancel_swap' && btnInteraction.user.id === userId) {
            transactionCancelled = true;
            buttonCollector.stop();
            try {
              await btnInteraction.update({
                content: 'Transaction cancelled.',
                components: [],
              });
            } catch (error) {
              console.error('Error updating button interaction:', error);
              await interaction.followUp({
                content: 'Transaction cancelled.',
                ephemeral: true,
              });
            }
          } else {
            await btnInteraction.reply({ content: 'You cannot use this button.', ephemeral: true });
          }
        });

        buttonCollector.on('end', async () => {
          if (!transactionCancelled) {
            try {
              await interaction.editReply({
                content: 'Processing your swap...',
                components: [],
              });

              const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
              const swapResult = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);

              if (swapResult.success) {
                await recordTrade(userId, wallet.publicKey, swapResult.signature, amount, inputTokenAddress);

                const selectionIndex = exitPercentages.indexOf(exitPercentage) !== -1 
                  ? ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌'][Math.floor(exitPercentages.indexOf(exitPercentage) / 2)]
                  : 'Custom';

                await interaction.editReply({
                  content: `Swap Complete!\n\nSold: ${amount} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>)\nReceived: ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputToken}>)\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)`,
                  components: [],
                });

                const publicMessage = `**${interaction.user.username}** sold a **${selectionIndex}** amount of **[${inputTokenInfo.symbol}](<https://solscan.io/token/${inputTokenAddress}>)** at **${amount/estimatedOutput} ${inputTokenInfo.symbol}/${outputTokenInfo.symbol}**`;
                await interaction.channel?.send(publicMessage);
              } else {
                const errorMessage = `Failed to execute sell order. Reason: ${swapResult.transactionMessage}\n\nError details: ${swapResult.error}`;
                try {
                  await interaction.editReply({
                    content: errorMessage,
                    components: [],
                  });
                } catch (replyError) {
                  console.error('Error editing reply:', replyError);
                  await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true,
                  });
                }
              }
            } catch (error: any) {
              console.error('Error executing swap:', error);
              let errorMessage = 'Failed to execute sell order. Please try again later.';
              if (error.message.includes('TransactionExpiredTimeoutError')) {
                const match = error.message.match(/Check signature ([a-zA-Z0-9]+)/);
                const signature = match ? match[1] : 'unknown';
                errorMessage = `Transaction timed out. It is unknown if it succeeded or failed. Check signature ${signature} using the Solana Explorer or CLI tools.`;
              }
              try {
                await interaction.editReply({
                  content: errorMessage,
                  components: [],
                });
              } catch (replyError) {
                console.error('Error editing reply:', replyError);
                await interaction.followUp({
                  content: errorMessage,
                  ephemeral: true,
                });
              }
            }
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
