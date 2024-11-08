import { Message, CommandInteraction } from "discord.js";
import Channel from '../../src/models/Channel';
import { handleHelp } from "./help.js";
import { handleStart } from "./start.js";
import { handleWallet } from "./wallet.js";
import { handleBalances } from "./balances.js";
import { handleTradeCommand } from "./trade.js";
import { handleFollow, handleUnfollow, handleList } from "./follow.js";
import { handleSettings, handleSet } from "./settings.js";
import { handleConnect } from "./connect.js";
import { handleInfo } from "./info.js";
import { handleShutdown } from "./shutdown.js";
import { handleProfile } from "./profile.js";
import { TextChannel } from "discord.js";
import { handleBuyCommand } from "./buy.js";
import { handleSellCommand } from "./sell.js";

export async function handleCommand(interaction: Message | CommandInteraction, command?: string, args?: string[]) {
  let channelId: string;
  let guildId: string | null;
  let reply: (content: string) => Promise<void>;
  let userId: string;

  if (interaction instanceof Message) {
    channelId = interaction.channel.id;
    guildId = interaction.guild?.id ?? null;
    reply = (content: string) => interaction.reply(content);
    userId = interaction.author.id;
  } else {
    channelId = interaction.channelId;
    guildId = interaction.guildId;
    reply = (content: string) => interaction.reply({ content, ephemeral: true });
    userId = interaction.user.id;
  }

  // Check if the command is in a DM or an allowed channel
  if (!guildId) {
    // Allow commands in DMs
    // ... (rest of the DM handling code)
  } else {
    // For guild messages, check if the channel is set up for the bot
    const channelStart = await Channel.findOne({ guildId, channelId });
    if (!channelStart && command !== 'start') {
      return reply("This channel is not set up for trading. An administrator must use `/ct start` in this channel first.");
    }

    switch (command) {
      case 'help':
        await handleHelp(reply);
        break;
      case 'start':
        await handleStart(interaction as CommandInteraction);
        break;
      case 'wallet':
        await handleWallet(userId, reply);
        break;
      case 'balances':
        await handleBalances(userId, reply);
        break;
      case 'trade':
        await handleTradeCommand(interaction, args);
        break;
      case 'follow':
        await handleFollow(userId, args, reply);
        break;
      case 'unfollow':
        await handleUnfollow(userId, args, reply);
        break;
      case 'list':
        await handleList(userId, reply);
        break;
      case 'settings':
        await handleSettings(userId, reply);
        break;
      case 'set':
        await handleSet(userId, args, reply);
        break;
      case 'connect':
        await handleConnect(interaction as CommandInteraction);
        break;
      case 'info':
        await handleInfo(interaction as CommandInteraction);
        break;
      case 'shutdown':
        await handleShutdown(interaction as CommandInteraction);
        break;
      case 'profile':
        await handleProfile(interaction as CommandInteraction);
        break;
      case 'buy':
        await handleBuyCommand(interaction as CommandInteraction);
        break;
      case 'sell':
        await handleSellCommand(interaction as CommandInteraction);
        break;
      default:
        reply("Unknown command. Use `.ct help` or `/ct help` for a list of available commands.");
    }
  }
}
