import { Message } from "discord.js";
import User from '../../models/User';

export async function handleRegister(message: Message) {
  try {
    const user = await User.findOneAndUpdate(
      { discordId: message.author.id },
      { $setOnInsert: { email: message.author.username, settings: { maxTradeAmount: 100 } } },
      { upsert: true, new: true }
    );

    message.reply(`Registration successful! 
    Use the web interface to link your wallet. 
    Your default max trade amount is set to 100. 
    Use \`.ct set maxTradeAmount <value>\` to change this setting.`);
  } catch (error) {
    console.error("Error in registration:", error);
    message.reply("An error occurred during registration. Please try again later.");
  }
}
