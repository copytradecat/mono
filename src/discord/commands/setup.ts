import { CommandInteraction, TextChannel, PermissionFlagsBits } from "discord.js";
import Channel from '../../models/Channel';

export async function handleSetup(interaction: CommandInteraction) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "This command can only be used by administrators in a server.", ephemeral: true });
  }

  // Defer the reply immediately
  await interaction.deferReply({ ephemeral: false });

  try {
    const channel = await Channel.findOneAndUpdate(
      { guildId: interaction.guild.id },
      {
        $set: {
          channelId: interaction.channelId,
          settings: { maxTradeAmount: 100 }
        }
      },
      { upsert: true, new: true }
    );

    // Edit the deferred reply
    await interaction.editReply({
      content: `Bot setup successful! This channel (${interaction.channel}) is now set for trading. Regular members can use \`/ct register\` to connect their wallets and start using the bot.`
    });
  } catch (error) {
    console.error("Error in setup:", error);
    await interaction.editReply({ content: "An error occurred during setup. Please try again later." });
  }
}
