import { CommandInteraction, MessageReaction, User } from 'discord.js';
import { getSwapTransaction } from '../../src/services/jupiter.service';
import { getUser, createSwapPreview, executeSwap, recordTrade, createMessageCollector } from './swap-base';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { rateLimitedRequest } from '../../src/services/jupiter.service';

const EXIT_PERCENTAGES = [0.24, 0.33, 1];
const REACTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣'];

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

export async function handleSellCommand(interaction: CommandInteraction) {
  const tokenAddress = interaction.options.getString('token', true);
  const userId = interaction.user.id;

  try {
    const user = await getUser(userId);
    await interaction.deferReply({ ephemeral: false });

    const wallet = user.wallets[0];
    const outputToken = 'So11111111111111111111111111111111111111112'; // SOL mint address

    const exitPercentages = user.settings.exitPercentages || EXIT_PERCENTAGES;
    const settings = user.settings || defaultSettings;
    const reactionEmojis = REACTION_EMOJIS.slice(0, exitPercentages.length);

    // Fetch token balance
    const { balance: tokenBalance, decimals } = await getTokenBalance(wallet.publicKey, tokenAddress);

    if (tokenBalance === 0) {
      await interaction.editReply("You don't have any balance for this token.");
      return;
    }

    const previewMessage = await interaction.editReply({
      content: `Select your exit percentage for selling ${tokenAddress}:\n` +
        exitPercentages.map((percentage, index) => {
          const amount = tokenBalance * (percentage / 100);
          return `${reactionEmojis[index]}: ${amount.toFixed(6)} (${percentage}% of your balance)`;
        }).join('\n') +
        '\nReact with 🚫 to cancel the transaction.',
      fetchReply: true
    });

    for (const emoji of [...reactionEmojis, '🚫']) {
      await previewMessage.react(emoji);
    }

    const filter = (reaction: MessageReaction, user: User) => 
      [...reactionEmojis, '🚫'].includes(reaction.emoji.name!) && user.id === userId;

    const collector = createMessageCollector(previewMessage, filter, 60000);

    collector.on('collect', async (reaction, user) => {
      collector.stop();
      if (reaction.emoji.name === '🚫') {
        await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
        return;
      }

      const sizeIndex = reactionEmojis.indexOf(reaction.emoji.name!);
      const exitPercentage = exitPercentages[sizeIndex];
      const amount = tokenBalance * (exitPercentage / 100);

      // Adjust the amount based on token decimals
      const adjustedAmount = Math.floor(amount * 10 ** decimals );

      try {
        const { quoteData, swapPreview } = await createSwapPreview(adjustedAmount, tokenAddress, outputToken, settings);

        console.log('Quote Data:', quoteData);

        const swapPreviewMessage = await interaction.followUp({ content: swapPreview, fetchReply: true });
        await swapPreviewMessage.react('🗑️');

        const cancelFilter = (reaction: MessageReaction, user: User) => 
          reaction.emoji.name === '🗑️' && user.id === userId;

        const cancelCollector = createMessageCollector(swapPreviewMessage, cancelFilter, 5000);

        cancelCollector.on('collect', async () => {
          cancelCollector.stop();
          await interaction.followUp({ content: 'Transaction cancelled.', ephemeral: true });
        });

        cancelCollector.on('end', async (collected) => {
          if (collected.size === 0) {
            try {
              const swapData = await getSwapTransaction(quoteData, wallet.publicKey, settings);
              console.log('Swap Data:', swapData);
              const signature = await executeSwap(userId, wallet.publicKey, swapData.swapTransaction);
              await recordTrade(userId, wallet.publicKey, signature, amount, tokenAddress);
              await interaction.followUp({ content: `Sell order executed successfully. Transaction ID: ${signature}`, ephemeral: true });
            } catch (error) {
              console.error('Sell execution failed:', error);
              if (error instanceof Error && 'logs' in error) {
                console.error('Transaction logs:', error.logs);
              }
              await interaction.followUp({ content: 'Failed to execute sell order. Please try again later.', ephemeral: true });
            }
          }
        });
      } catch (error) {
        console.error('Error getting quote:', error);
        await interaction.followUp({ content: 'Failed to get quote. Please try again later.', ephemeral: true });
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.followUp({ content: 'Sell order timed out. Please try again.', ephemeral: true });
      }
    });

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

  // console.log('Token Account Info:', tokenAccount);

  return { balance, decimals };
}