import { Message } from "discord.js";
import User from '../../models/User';

export async function handleSettings(message: Message) {
  try {
    const user = await User.findOne({ discordId: message.author.id });
    if (!user) {
      return message.reply("You need to register first. Use `.ct register` to get started.");
    }
    
    const settingsInfo = Object.entries(user.settings).map(([key, value]) => 
      `${key}: ${value}`
    ).join('\n');
    
    message.reply(`Your current settings:\n${settingsInfo}`);
  } catch (error) {
    console.error("Error in settings command:", error);
    message.reply("An error occurred while fetching your settings.");
  }
}

export async function handleSet(message: Message, args: string[]) {
  if (args.length < 2) {
    return message.reply("Usage: .ct set <setting> <value>");
  }
  
  const [setting, value] = args;
  
  try {
    const user = await User.findOne({ discordId: message.author.id });
    if (!user) {
      return message.reply("You need to register first. Use `.ct register` to get started.");
    }
    
    if (!(setting in user.settings)) {
      return message.reply(`Invalid setting: ${setting}`);
    }
    
    user.settings[setting] = value;
    await user.save();
    
    message.reply(`Setting updated: ${setting} = ${value}`);
  } catch (error) {
    console.error("Error in set command:", error);
    message.reply("An error occurred while updating your settings.");
  }
}
