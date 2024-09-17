import { Message } from "discord.js";
import User from '../../models/User';

export async function handleRegister(userId: string, reply: (content: string) => Promise<void>) {
  try {
    const user = await User.findOneAndUpdate(
      { discordId: userId },
      { $setOnInsert: { settings: { maxTradeAmount: 100 } } },
      { upsert: true, new: true }
    );

    reply(`Registration successful! 
    Use the web interface to link your wallet. 
    Your default max trade amount is set to 100. 
    Use \`.ct set maxTradeAmount <value>\` to change this setting.`);
  } catch (error) {
    console.error("Error in registration:", error);
    reply("An error occurred during registration. Please try again later.");
  }
}
