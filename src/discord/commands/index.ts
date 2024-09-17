import { Message, CommandInteraction } from "discord.js";
import Channel from '../../models/Channel';
import { handleHelp } from "./help.js";
import { handleRegister } from "./register.js";
import { handleSetup } from "./setup.js";
import { handleWallet } from "./wallet.js";
import { handleBalance } from "./balance.js";
import { handleTradeCommand } from "./trade.js";
import { handleFollow, handleUnfollow, handleList } from "./follow.js";
import { handleSettings, handleSet } from "./settings.js";

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
  if (!guildId || await Channel.findOne({ channelId }) || channelId === process.env.DISCORD_TEST_CHANNEL_ID) {
    switch (command) {
      case 'help':
        await handleHelp(reply);
        break;
      case 'register':
        await handleRegister(userId, reply);
        break;
      case 'setup':
        await handleSetup(interaction);
        break;
      case 'wallet':
        await handleWallet(userId, reply);
        break;
      case 'balance':
        await handleBalance(userId, reply);
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
      default:
        reply("Unknown command. Use `.ct help` or `/ct help` for a list of available commands.");
    }
  } else {
    reply("This command can only be used in designated channels or direct messages.");
  }
}
