import { Message } from "discord.js";
import User from '../../models/User';

export async function handleWallet(userId: string, reply: (content: string) => Promise<void>) {
  try {
    const user = await User.findOne({ discordId: userId });
    if (!user || user.wallets.length === 0) {
      return reply("You don't have any wallets linked to your account.");
    }
    
    const walletInfo = user.wallets.map((wallet: { publicKey: any; }, index: number) => 
      `Wallet ${index + 1}: ${wallet.publicKey}`
    ).join('\n');
    
    reply(`Your linked wallets:\n${walletInfo}`);
  } catch (error) {
    console.error("Error in wallet command:", error);
    reply("An error occurred while fetching your wallet information.");
  }
}
