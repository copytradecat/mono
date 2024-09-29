import {
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import {
  getUser,
  getBalance,
  createSwapPreview,
  executeSwap,
  recordTrade,
  swapTime,
} from './swap-base';
import { getSwapTransaction, getTokenInfo } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { truncatedString } from '../../src/lib/utils';

export async function handleBuyCommand(interaction: CommandInteraction) {
  const outputTokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  try {
    const user = await getUser(userId);
    const wallet = user.wallets[0];
    const inputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address
    const inputTokenInfo = await getTokenInfo(inputToken);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);
    const entryAmounts = user.settings.entryAmounts || [0.05, 0.1, 0.25, 0.5, 1];
    const settings = user.settings || defaultSettings;

    const balanceLamports = await getBalance(wallet.publicKey);
    const balance = balanceLamports / 10 ** 9; // Convert lamports to SOL

    const buttons = entryAmounts.map(amount => 
      new ButtonBuilder()
        .setCustomId(`amount_${amount}`)
        .setLabel(`${amount} SOL`)
        .setStyle(ButtonStyle.Primary)
    );

    const customButton = new ButtonBuilder()
      .setCustomId('custom')
      .setLabel('Custom amount')
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
      content: `Select your entry size for buying ${outputTokenInfo.symbol} ([${truncatedString(outputTokenAddress, 4)}](<https://solscan.io/token/${outputTokenAddress}>)):`,
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
        await interaction.editReply({ content: 'Buy order cancelled.', components: [] });
        return;
      }

      let selectedAmount: number;
      if (confirmation.customId === 'custom') {
        await interaction.editReply({
          content: 'Please enter the custom amount in SOL:',
          components: [],
        });
        try {
          const customAmountResponse = await interaction.channel!.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: 30000,
            errors: ['time'],
          });
          selectedAmount = parseFloat(customAmountResponse.first()!.content);
          if (isNaN(selectedAmount) || selectedAmount <= 0) {
            await interaction.editReply({
              content: 'Invalid amount. Buy order cancelled.',
              components: [],
            });
            return;
          }
        } catch (error) {
          await interaction.editReply({
            content: 'No amount provided. Buy order cancelled.',
            components: [],
          });
          return;
        }
      } else {
        selectedAmount = parseFloat(confirmation.customId.split('_')[1]);
      }

      let requiredBalance = selectedAmount;

      if (inputToken === 'So11111111111111111111111111111111111111112') {
        requiredBalance = selectedAmount + 0.005; // Add 0.005 SOL for transaction fees (only for SOL)
      }
      if (balance < requiredBalance) {
        await interaction.editReply({
          content: `Insufficient balance. You need at least ${requiredBalance} ${inputTokenInfo.symbol} for this transaction.`,
          components: [],
        });
        return;
      }

      const adjustedAmount = Math.floor(selectedAmount * 10 ** inputTokenInfo.decimals);

      const { quoteData, swapPreview, estimatedOutput } = await createSwapPreview(
        adjustedAmount,
        inputToken,
        outputTokenAddress,
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
      const fiveSecondsFromNow = Math.floor(Date.now() / 1000) + 5;
      await interaction.editReply({
        content: `${swapPreview}\n\nSubmitting swap <t:${fiveSecondsFromNow}:R>\n\nClick 'Swap Now' to proceed immediately, or 'Cancel' within 5 seconds to abort transaction.`,
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
              await executeSwapTransaction(interaction, userId, wallet, quoteData, settings, selectedAmount, outputTokenAddress, inputTokenInfo, outputTokenInfo, estimatedOutput, inputToken, entryAmounts);
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
            await executeSwapTransaction(interaction, userId, wallet, quoteData, settings, selectedAmount, outputTokenAddress, inputTokenInfo, outputTokenInfo, estimatedOutput, inputToken, entryAmounts);
          }
        });

      } catch (error) {
        console.error('Error in button collector:', error);
        await interaction.followUp({
          content: 'An error occurred while processing your buy order.',
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('Buy order timed out or was cancelled:', error);
      await interaction.editReply({
        content: 'Buy order timed out or was cancelled. Please try again.',
        components: [],
      });
    }
  } catch (error) {
    console.error('Error in handleBuyCommand:', error);
    await interaction.editReply({
      content: 'An error occurred while processing your buy order.',
      components: [],
    });
  }
}

async function executeSwapTransaction(
  interaction: CommandInteraction,
  userId: string,
  wallet: any,
  quoteData: any,
  settings: any,
  selectedAmount: number,
  outputTokenAddress: string,
  inputTokenInfo: any,
  outputTokenInfo: any,
  estimatedOutput: number,
  inputToken: string,
  entryAmounts: number[]
) {
  try {
    const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
    const swapResult = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);

    if (swapResult.success) {
      await recordTrade(userId, wallet.publicKey, swapResult.signature, selectedAmount, outputTokenAddress);

      const selectionIndex = entryAmounts.indexOf(selectedAmount) !== -1 
        ? ['Small 🤏', 'Medium ✊', 'Large 🤲', 'Very Large 🙌', 'Massive 🦍', 'MEGAMOON 🌝'][Math.floor(entryAmounts.indexOf(selectedAmount) / 2)]
        : 'Custom';

      await interaction.editReply({
        content: `Swap Complete!\n\nBought: ${estimatedOutput} [${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>)\nUsing: ${selectedAmount} [${inputTokenInfo.symbol}](<https://solscan.io/token/${inputToken}>)\nTransaction ID: [${truncatedString(swapResult.signature, 4)}](<https://solscan.io/tx/${swapResult.signature}>)`,
        components: [],
      });

      const publicMessage = `**${interaction.user.username}** bought a **${selectionIndex}** amount of **[${outputTokenInfo.symbol}](<https://solscan.io/token/${outputTokenAddress}>)** at **${estimatedOutput/selectedAmount} ${outputTokenInfo.symbol}/${inputTokenInfo.symbol}**`;
      await interaction.channel?.send(publicMessage);
    } else {
      const errorMessage = `Failed to execute buy order. Reason: ${swapResult.transactionMessage}\n\nError details: ${swapResult.error}`;
      await interaction.editReply({
        content: errorMessage,
        components: [],
      });
    }
  } catch (error: any) {
    console.error('Error executing swap:', error);
    let errorMessage = 'Failed to execute buy order. Please try again later.';
    if (error.message.includes('TransactionExpiredTimeoutError')) {
      const match = error.message.match(/Check signature ([a-zA-Z0-9]+)/);
      const signature = match ? match[1] : 'unknown';
      errorMessage = `Transaction timed out. It is unknown if it succeeded or failed. Check signature ${signature} using the Solana Explorer or CLI tools.`;
    }
    await interaction.editReply({
      content: errorMessage,
      components: [],
    });
  }
}