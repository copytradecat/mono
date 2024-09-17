import { Client, GatewayIntentBits, Partials } from "discord.js";
import dotenv from 'dotenv';
import { handleCommand } from './commands/index.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once("ready", () => {
  console.log("Discord bot is ready!");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.startsWith('.ct ')) {
    await handleCommand(message);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
