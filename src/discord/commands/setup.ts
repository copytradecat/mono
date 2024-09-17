import { Message, PermissionFlagsBits } from "discord.js";
import Channel from '../../models/Channel';

export async function handleSetup(message: Message) {
  if (!message.guild || !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    return message.reply("This command can only be used by administrators in a server.");
  }

  try {
    await Channel.findOneAndUpdate(
      { guildId: message.guild.id, channelId: message.channel.id },
      { $setOnInsert: { settings: { maxTradeAmount: 100 } } },
      { upsert: true, new: true }
    );

    message.reply(`Setup complete! This channel is now configured for CopyTradeCat commands. 
    Default max trade amount is set to 100. 
    Use \`.ct set maxTradeAmount <value>\` to change this setting.`);
  } catch (error) {
    console.error("Error in setup:", error);
    message.reply("An error occurred during setup. Please try again later.");
  }
}
