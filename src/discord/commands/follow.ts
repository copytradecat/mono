import { Message } from "discord.js";
import User from '../../models/User';
import Follow from '../../models/Follow';

export async function handleFollow(message: Message, args: string[]) {
  if (args.length < 1) {
    return message.reply("Please provide a trader address to follow.");
  }
  
  const traderAddress = args[0];
  
  try {
    const user = await User.findOne({ discordId: message.author.id });
    if (!user) {
      return message.reply("You need to register first. Use `.ct register` to get started.");
    }
    
    await Follow.create({
      followerId: user._id,
      traderAddress: traderAddress
    });
    
    message.reply(`You are now following trader with address: ${traderAddress}`);
  } catch (error) {
    console.error("Error in follow command:", error);
    message.reply("An error occurred while trying to follow the trader.");
  }
}

export async function handleUnfollow(message: Message, args: string[]) {
  if (args.length < 1) {
    return message.reply("Please provide a trader address to unfollow.");
  }
  
  const traderAddress = args[0];
  
  try {
    const user = await User.findOne({ discordId: message.author.id });
    if (!user) {
      return message.reply("You need to register first. Use `.ct register` to get started.");
    }
    
    const result = await Follow.deleteOne({ followerId: user._id, traderAddress: traderAddress });
    
    if (result.deletedCount > 0) {
      message.reply(`You have unfollowed trader with address: ${traderAddress}`);
    } else {
      message.reply(`You were not following trader with address: ${traderAddress}`);
    }
  } catch (error) {
    console.error("Error in unfollow command:", error);
    message.reply("An error occurred while trying to unfollow the trader.");
  }
}

export async function handleList(message: Message) {
  try {
    const user = await User.findOne({ discordId: message.author.id });
    if (!user) {
      return message.reply("You need to register first. Use `.ct register` to get started.");
    }
    
    const follows = await Follow.find({ followerId: user._id });
    
    if (follows.length === 0) {
      return message.reply("You are not following any traders.");
    }
    
    const traderList = follows.map((follow, index) => 
      `${index + 1}. ${follow.traderAddress}`
    ).join('\n');
    
    message.reply(`Traders you are following:\n${traderList}`);
  } catch (error) {
    console.error("Error in list command:", error);
    message.reply("An error occurred while fetching your followed traders.");
  }
}
