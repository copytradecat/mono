import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import Channel from '../../models/Channel';

export async function handleSetup(interaction: CommandInteraction) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "This command can only be used by administrators in a server.", ephemeral: true });
  }

  try {
    await Channel.findOneAndUpdate(
      { guildId: interaction.guild.id, channelId: interaction.channelId },
      { $setOnInsert: { settings: { maxTradeAmount: 100 } } },
      { upsert: true, new: true }
    );

    interaction.reply({
      content: `Setup complete! This channel is now configured for CopyTradeCat commands. 
      Default max trade amount is set to 100. 
      Use \`.ct set maxTradeAmount <value>\` to change this setting.`,
      ephemeral: true
    });
  } catch (error) {
    console.error("Error in setup:", error);
    interaction.reply({ content: "An error occurred during setup. Please try again later.", ephemeral: true });
  }
}
