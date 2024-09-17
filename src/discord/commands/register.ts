import { Message } from "discord.js";
import User from '../../models/User';

export async function handleRegister(userId: string, reply: (content: string) => Promise<void>) {
  try {
    const user = await User.findOneAndUpdate(
      { discordId: userId },
      { $setOnInsert: { settings: { maxTradeAmount: 100 } } },
      { upsert: true, new: true }
    );

    const webAppUrl = 'https://copytradecat.com/connect-wallet';

    reply(`Registration successful! 
    Please visit ${webAppUrl} to connect your wallet and complete the setup.
    Your default max trade amount is set to 100. 
    You can change your settings on the web interface or use \`.ct set maxTradeAmount <value>\` to update this setting.`);
  } catch (error) {
    console.error("Error in registration:", error);
    reply("An error occurred during registration. Please try again later.");
  }
}
