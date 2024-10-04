import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import Channel from '../../src/models/Channel';

export async function handleShutdown(interaction: CommandInteraction) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "This command can only be used by administrators in a server.", ephemeral: true });
  }

  // Defer the reply immediately
  await interaction.deferReply({ ephemeral: false });

  try {
    const result = await Channel.deleteOne({ guildId: interaction.guild.id });

    if (result.deletedCount === 0) {
      return interaction.editReply({
        content: "The bot is not currently set up in this server. Use `/ct start` to set it up."
      });
    }

    // Edit the deferred reply
    await interaction.editReply({
      content: "Bot shutdown successful. The bot has been disabled for this server. Use `/ct start` to set it up again if needed."
    });
  } catch (error) {
    console.error("Error in shutdown:", error);
    await interaction.editReply({ content: "An error occurred during shutdown. Please try again later." });
  }
}
