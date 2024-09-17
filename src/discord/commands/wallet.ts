import { Message } from "discord.js";
import User from '../../models/User';

export async function handleWallet(message: Message) {
  try {
    const user = await User.findOne({ discordId: message.author.id });
    if (!user || user.wallets.length === 0) {
      return message.reply("You don't have any wallets linked to your account.");
    }
    
    const walletInfo = user.wallets.map((wallet: { publicAddress: any; }, index: number) => 
      `Wallet ${index + 1}: ${wallet.publicAddress}`
    ).join('\n');
    
    message.reply(`Your linked wallets:\n${walletInfo}`);
  } catch (error) {
    console.error("Error in wallet command:", error);
    message.reply("An error occurred while fetching your wallet information.");
  }
}
