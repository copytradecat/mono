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

  // Fetch the user's data from the database
  await dbConnect();
  const user = await User.findOne({ discordId: userId });

  if (!user || !user.encryptedSeed) {
    return interaction.reply('You need to set up your wallet first.');
  }

  // Check if the trade amount exceeds the user's maxTradeAmount setting
  if (amount > user.settings.maxTradeAmount) {
    return interaction.reply(`Trade amount exceeds your maximum trade amount setting of ${user.settings.maxTradeAmount}.`);
  }

  // Decrypt the seed
  const decryptedSeed = decrypt(user.encryptedSeed);
  const keypair = Keypair.fromSecretKey(bs58.decode(decryptedSeed));

  // Create Solana connection
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

  try {
    // Implement the trade logic here
    // This is a placeholder and should be replaced with actual trading logic
    const transaction = new Transaction();
    // Add instructions to the transaction based on the token and amount
    // For example, if trading SOL:
    // const transferInstruction = SystemProgram.transfer({
    //   fromPubkey: keypair.publicKey,
    //   toPubkey: new PublicKey('DESTINATION_ADDRESS'),
    //   lamports: amount * LAMPORTS_PER_SOL
    // });
    // transaction.add(transferInstruction);

    // Sign and send the transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    // Store trade information in database
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
