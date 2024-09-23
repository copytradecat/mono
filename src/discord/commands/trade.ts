import { signAndSendTransaction } from '../../services/signing.service';
import { getQuote, getSwapTransaction } from '../../services/jupiter.service';
import User from '../../models/User';
import Trade from '../../models/Trade';

export async function handleTradeCommand(interaction: any, args: string[]) {
  if (args.length < 2) {
    return interaction.reply('Usage: /ct trade <amount> <token>');
  }

  const amount = parseFloat(args[0]);
  const token = args[1].toUpperCase();
  const userId = interaction.user?.id || interaction.author.id;

  try {
    const user = await User.findOne({ discordId: userId });

    if (!user || user.wallets.length === 0) {
      return interaction.reply('You need to set up your wallet first.');
    }

    const wallet = user.wallets[0]; // Assuming the first wallet is the default

    const quoteData = await getQuote('So11111111111111111111111111111111111111112', token === 'SOL' ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount * 1e9);
    const swapData = await getSwapTransaction(quoteData, wallet.publicKey);

    const signature = await signAndSendTransaction(user._id, wallet.publicKey, swapData.swapTransaction);

    await Trade.create({
      user: userId,
      txid: signature,
      amount,
      token,
    });

    interaction.reply(`Trade executed successfully. Transaction ID: ${signature}`);
  } catch (error) {
    console.error('Trade execution failed:', error);
    interaction.reply('Failed to execute trade. Please try again later.');
  }
}
