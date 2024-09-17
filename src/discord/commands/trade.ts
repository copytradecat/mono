import { Message } from 'discord.js';
import { Connection, Transaction, Keypair } from '@solana/web3.js';
import Trade from '../../models/Trade';
import dbConnect from '../../lib/mongodb';
import User from '../../models/User';
import { decrypt } from '../../lib/encryption';
import bs58 from 'bs58';

export async function handleTradeCommand(message: Message) {
  const args = message.content.split(' ');
  if (args.length < 3) {
    return message.reply('Usage: !trade <amount> <token>');
  }

  const amount = parseFloat(args[1]);
  const token = args[2];

  // Fetch the user's encrypted seed from the database
  await dbConnect();
  const user = await User.findOne({ discordId: message.author.id });

  if (!user || !user.encryptedSeed) {
    return message.reply('You need to set up your wallet first.');
  }

  // Decrypt the seed
  const decryptedSeed = decrypt(user.encryptedSeed);
  const keypair = Keypair.fromSecretKey(bs58.decode(decryptedSeed));

  // Create Solana connection
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

  // Build the transaction
  const transaction = new Transaction();

  // Add transaction instructions based on amount and token
  // TODO: Implement actual trade logic here

  try {
    // Sign and send the transaction
    const signature = await connection.sendTransaction(transaction, [keypair]);
    await connection.confirmTransaction(signature);

    // Store trade information in database
    await Trade.create({
      user: message.author.id,
      txid: signature,
      amount,
      token,
    });

    message.reply(`Trade executed successfully. Transaction ID: ${signature}`);
  } catch (error) {
    console.error('Trade execution failed:', error);
    message.reply('Failed to execute trade. Please try again later.');
  }
}
