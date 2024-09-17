import { Message } from "discord.js";
import Channel from '../../models/Channel';
import { handleHelp } from "./help.js";
import { handleRegister } from "./register.js";
import { handleSetup } from "./setup.js";
import { handleWallet } from "./wallet.js";
import { handleBalance } from "./balance.js";
import { handleTradeCommand } from "./trade.js";
import { handleFollow, handleUnfollow, handleList } from "./follow.js";
import { handleSettings, handleSet } from "./settings.js";

export async function handleCommand(message: Message) {
  const args = message.content.slice(4).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // Check if the command is in a DM or an allowed channel
  if (!message.guild || await Channel.findOne({ channelId: message.channel.id })) {
    switch (command) {
      case 'help':
        await handleHelp(message);
        break;
      case 'register':
        await handleRegister(message);
        break;
      case 'setup':
        await handleSetup(message);
        break;
      case 'wallet':
        await handleWallet(message);
        break;
      case 'balance':
        await handleBalance(message);
        break;
      case 'trade':
        await handleTradeCommand(message, args);
        break;
      case 'follow':
        await handleFollow(message, args);
        break;
      case 'unfollow':
        await handleUnfollow(message, args);
        break;
      case 'list':
        await handleList(message);
        break;
      case 'settings':
        await handleSettings(message);
        break;
      case 'set':
        await handleSet(message, args);
        break;
      default:
        message.reply("Unknown command. Use `.ct help` for a list of available commands.");
    }
  } else {
    message.reply("This command can only be used in designated channels or direct messages.");
  }
}
