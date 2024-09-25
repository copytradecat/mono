import { CommandInteraction, MessageReaction, User, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } from 'discord.js';
import { getSwapTransaction } from '../../src/services/jupiter.service';
import { getUser, createSwapPreview, executeSwap, recordTrade, createMessageCollector, swapTime } from './swap-base';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { rateLimitedRequest } from '../../src/services/jupiter.service';
import { defaultSettings } from '../../src/components/BotSettings';
import { getTokenInfo } from '../../src/services/jupiter.service';

const EXIT_PERCENTAGES = [0.24, 0.33, 1];
const REACTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣'];

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
        new StringSelectMenuOptionBuilder()
          .setLabel('Custom percentage')
          .setValue('custom'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Cancel')
          .setValue('cancel')
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const response = await interaction.editReply({
      content: `Select your exit percentage for selling ${tokenInfo.symbol}:`,
      components: [row],
    });

    try {
      const collectorFilter = (i: { user: { id: string; }; }) => i.user.id === interaction.user.id;
      const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });

      if (confirmation.customId === 'exit_percentage') {
        if (confirmation.values[0] === 'cancel') {
          await interaction.followUp({ content: 'Sell order cancelled.', ephemeral: true });
          return;
        }

        let exitPercentage: number;
        if (confirmation.values[0] === 'custom') {
          await interaction.followUp({ content: 'Please enter the custom exit percentage:', ephemeral: true });
          try {
            const customPercentageResponse = await interaction.channel!.awaitMessages({
              filter: (m) => m.author.id === interaction.user.id,
              max: 1,
              time: 30000,
              errors: ['time']
            });
            exitPercentage = parseFloat(customPercentageResponse.first()!.content);
            if (isNaN(exitPercentage) || exitPercentage <= 0 || exitPercentage > 100) {
              await interaction.followUp({ content: 'Invalid percentage. Sell order cancelled.', ephemeral: true });
              return;
            }
          } catch (error) {
            await interaction.followUp({ content: 'No percentage provided. Sell order cancelled.', ephemeral: true });
            return;
          }
        } else {
          exitPercentage = parseFloat(confirmation.values[0]);
        }

        const amount = tokenBalance * (exitPercentage / 100);
        const adjustedAmount = Math.floor(amount * 10 ** decimals);

        try {
          const { quoteData, swapPreview } = await createSwapPreview(adjustedAmount, tokenAddress, outputToken, settings);

          console.log('Quote Data:', quoteData);

          const swapPreviewMessage = await interaction.followUp({ content: swapPreview, fetchReply: true });
          await swapPreviewMessage.react('🗑️');

          const cancelFilter = (reaction: MessageReaction, user: User) => 
            reaction.emoji.name === '🗑️' && user.id === userId;

          const cancelCollector = swapPreviewMessage.createReactionCollector({ filter: cancelFilter, time: swapTime });

          cancelCollector.on('collect', async () => {
            cancelCollector.stop();
            await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
          });

          cancelCollector.on('end', async (collected) => {
            // Remove the trashcan emoji and the cancellation message
            const trashReaction = swapPreviewMessage.reactions.cache.get('🗑️');
            if (trashReaction) {
              await trashReaction.remove();
            }
            await swapPreviewMessage.edit({
              content: swapPreview.split('\n').slice(0, -1).join('\n'),
              components: []
            });

            if (collected.size === 0) {
              try {
                const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
                console.log('Swap Data:', swapData);
                const swapResult = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);
                if (swapResult.success) {
                  await recordTrade(userId, wallet.publicKey, swapResult.signature, amount, tokenAddress);
                  await interaction.followUp({ content: `Sell order executed successfully. Transaction ID: ${swapResult.signature}`, ephemeral: true });
                } else {
                  const errorMessage = `Failed to execute sell order. Reason: ${swapResult.transactionMessage}`;
                  await interaction.followUp({ content: errorMessage, ephemeral: true });
                }
              } catch (error) {
                console.error('Sell execution failed:', error);
                await interaction.followUp({ content: 'Failed to execute sell order. Please try again later.', ephemeral: true });
              }
            }
          });
        } catch (error) {
          console.error('Error getting quote:', error);
          await interaction.followUp({ content: 'Failed to get quote. Please try again later.', ephemeral: true });
        }
      }
    } catch (error) {
      console.error('Sell order timed out. Please try again.', error);
      await interaction.followUp({ content: 'Sell order timed out. Please try again.', ephemeral: true });
    }
  } catch (error) {
    console.error('Error in handleSellCommand:', error);
    interaction.followUp({ content: 'An error occurred while processing your sell order.', ephemeral: true });
  }
}

async function getTokenBalance(walletAddress: string, tokenAddress: string): Promise<{ balance: number, decimals: number }> {
  const walletPublicKey = new PublicKey(walletAddress);
  const tokenPublicKey = new PublicKey(tokenAddress);

  const tokenAccounts = await rateLimitedRequest(() => 
    connection.getParsedTokenAccountsByOwner(walletPublicKey, {
      mint: tokenPublicKey
    })
  );

  if (tokenAccounts.value.length === 0) {
    return { balance: 0, decimals: 0 };
  }

  const tokenAccount = tokenAccounts.value[0].account.data.parsed.info;
  const balance = tokenAccount.tokenAmount.uiAmount;
  const decimals = tokenAccount.tokenAmount.decimals;

  console.log('Token Account Info:', tokenAccount);

  return { balance, decimals };
}