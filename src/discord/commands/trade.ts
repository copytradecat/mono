import { Connection, Transaction, Keypair } from '@solana/web3.js';
import Trade from '../../models/Trade';
import dbConnect from '../../lib/mongodb.js';
import User from '../../models/User';
import { decrypt } from '../../lib/encryption.js';
import bs58 from 'bs58';

export async function handleTradeCommand(interaction: any, args: string[]) {
  if (args.length < 2) {
    return interaction.reply('Usage: /ct trade <amount> <token>');
  }

  const amount = parseFloat(args[0]);
  const token = args[1].toUpperCase();
  const userId = interaction.user?.id || interaction.author.id;

  await dbConnect();
  const user = await User.findOne({ discordId: userId });

  if (!user || !user.encryptedSeed) {
    return interaction.reply('You need to set up your wallet first.');
  }

  if (amount > user.settings.maxTradeAmount) {
    return interaction.reply(`Trade amount exceeds your maximum trade amount setting of ${user.settings.maxTradeAmount}.`);
  }

  const decryptedSeed = decrypt(user.encryptedSeed);
  const keypair = Keypair.fromSecretKey(bs58.decode(decryptedSeed));
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

  try {
    const transaction = new Transaction();
    // Add actual trading logic here based on the token
    // This is a placeholder for demonstration
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

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
