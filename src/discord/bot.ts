import { Client, GatewayIntentBits } from "discord.js";
import dotenv from 'dotenv';
import { handleTradeCommand } from './commands/trade';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log("Discord bot is ready!");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!trade')) {
    await handleTradeCommand(message);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
