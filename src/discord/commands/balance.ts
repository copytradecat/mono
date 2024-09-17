import { Message } from "discord.js";
import { Connection, PublicKey, PublicKeyInitData } from "@solana/web3.js";
import User from '../../models/User';

export async function handleBalance(message: Message) {
  try {
    const user = await User.findOne({ discordId: message.author.id });
    if (!user || user.wallets.length === 0) {
      return message.reply("You don't have any wallets linked to your account.");
    }
    
    const connection = new Connection(process.env.SOLANA_RPC_URL!);
    
    const balancePromises = user.wallets.map(async (wallet: { publicAddress: PublicKeyInitData; }) => {
      const publicKey = new PublicKey(wallet.publicAddress);
      const balance = await connection.getBalance(publicKey);
      return `${wallet.publicAddress}: ${balance / 1e9} SOL`;
    });
    
    const balances = await Promise.all(balancePromises);
    message.reply(`Your wallet balances:\n${balances.join('\n')}`);
  } catch (error) {
    console.error("Error in balance command:", error);
    message.reply("An error occurred while fetching your balance information.");
  }
}
