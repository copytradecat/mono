import { Message } from "discord.js";
import User from '../../src/models/User';
import dotenv from 'dotenv';

dotenv.config({ path: ['../.env.local', '../.env'] });

export async function handleRegister(userId: string, channelId: string, reply: (content: string) => Promise<void>) {
  try {
    const user = await User.findOneAndUpdate(
      { name: userId },
      { 
        $setOnInsert: { 
          name: userId,
          discordId: userId,
          settings: { maxTradeAmount: 100 } 
        } 
      },
      { upsert: true, new: true }
    );

    const webAppUrl = `${process.env.NEXT_PUBLIC_WEBSITE_URL}/register?channelId=${channelId}`;

    reply(`Registration successful! 
    Please visit ${webAppUrl} to connect your wallet and complete the setup.
    Your default max trade amount is set to 100. 
    You can change your settings on the web interface or use \`/ct set maxTradeAmount <value>\` to update this setting.`);
  } catch (error) {
    console.error("Error in registration:", error);
    reply("An error occurred during registration. Please try again later.");
  }
}