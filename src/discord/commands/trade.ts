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
    const user = await User.findOne({ name: userId });

    if (!user || user.wallets.length === 0) {
      return interaction.reply('You need to set up your wallet first.');
    }

    const wallet = user.wallets[0]; // Assuming the first wallet is the default

    const quoteData = await getQuote(
      'So11111111111111111111111111111111111111112', // SOL mint address
      token === 'SOL'
        ? 'So11111111111111111111111111111111111111112'
        : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint address
      amount * 1e9,
      user.settings.slippage
    );

    const swapData = await getSwapTransaction(quoteData, wallet.publicKey, user.settings);

    const signature = await signAndSendTransaction(
      user._id.toString(),
      wallet.publicKey,
      swapData.swapTransaction
    );

    await Trade.create({
      userId: userId,
      walletAddress: wallet.publicKey,
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
