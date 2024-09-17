import { Client, GatewayIntentBits } from "discord.js";
import dotenv from 'dotenv';

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

  // Implement command handling logic here
  if (message.content.startsWith('!trade')) {
    // Handle trade command
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

export default client;
