import { Message } from "discord.js";
import dotenv from 'dotenv';

dotenv.config({ path: ['../.env.local', '../.env'] });

export function handleHelp(reply: (content: string) => Promise<void>) {
  const helpText = `
Available commands:
/ct help - Display this help message
/ct connect - Link your Discord and wallets to the bot
/ct balances - Show current balance of linked wallet
/ct buy - Buy a token
/ct sell - Sell a token
/ct start - Initialize the bot for this channel
/ct stop - Disable the bot for this channel

For more detailed instructions and to manage your account, visit our website:
${process.env.NEXT_PUBLIC_WEBSITE_URL}
  `;
  
  reply(helpText);
}
