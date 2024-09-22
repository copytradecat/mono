import { Message } from "discord.js";
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

export function handleHelp(reply: (content: string) => Promise<void>) {
  const helpText = `
Available commands:
/ct help - Display this help message
/ct register - Link your Discord account to the web app
/ct wallet - Display linked wallet information
/ct balance - Show current balance of linked wallet
/ct profile - Show your wallet information and token balances
/ct trade <amount> <token> - Execute a trade
/ct follow <trader_address> - Start copying trades from a specific address
/ct unfollow <trader_address> - Stop copying trades from a specific address
/ct list - Show list of traders being followed
/ct settings - Display current settings
/ct set <setting> <value> - Update a specific setting

For more detailed instructions and to manage your account, visit our website:
${process.env.NEXT_PUBLIC_WEBSITE_URL}
  `;
  
  reply(helpText);
}
