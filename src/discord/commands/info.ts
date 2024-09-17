import { CommandInteraction } from "discord.js";
import Channel from '../../models/Channel';
import Trade from '../../models/Trade';

export async function handleInfo(interaction: CommandInteraction) {
  try {
    const channel = await Channel.findOne({ guildId: interaction.guildId, channelId: interaction.channelId });
    
    if (!channel) {
      return interaction.reply("This channel is not set up for trading. An administrator must use `/ct setup` first.");
    }

    const recentTrades = await Trade.find({ channelId: interaction.channelId })
      .sort({ createdAt: -1 })
      .limit(5);

    let infoMessage = `Channel Status: Set up for trading\n`;
    infoMessage += `Max Trade Amount: ${channel.settings.maxTradeAmount}\n\n`;
    infoMessage += `Recent Trades:\n`;

    if (recentTrades.length === 0) {
      infoMessage += "No recent trades.";
    } else {
      recentTrades.forEach((trade, index) => {
        infoMessage += `${index + 1}. Amount: ${trade.amount} ${trade.token}, TxID: ${trade.txid}\n`;
      });
    }

    await interaction.reply({ content: infoMessage, ephemeral: false });
  } catch (error) {
    console.error("Error in info command:", error);
    await interaction.reply({ content: "An error occurred while fetching channel information.", ephemeral: true });
  }
}
