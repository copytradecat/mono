import { CommandInteraction, TextChannel, PermissionFlagsBits } from "discord.js";
import Channel from '../../src/models/Channel';

export async function handleStart(interaction: CommandInteraction) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "This command can only be used by administrators in a server.", ephemeral: true });
  }

  // Defer the reply immediately
  await interaction.deferReply({ ephemeral: false });

  try {
    const existingChannel = await Channel.findOne({ guildId: interaction.guild.id });
    if (existingChannel) {
      return interaction.editReply({
        content: `The bot is already set up in this server. The trading channel is <#${existingChannel.channelId}>. Use \`/ct info\` for more details.`
      });
    }

    const channel = await Channel.create({
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      settings: { maxTradeAmount: 100 }
    });

    // Edit the deferred reply
    await interaction.editReply({
      content: `Bot setup successful! This channel (${interaction.channel}) is now set for trading. Regular members can use \`/ct register\` to connect their wallets and start using the bot. Use \`/ct info\` to check the bot's status.`
    });
  } catch (error) {
    console.error("Error in setup:", error);
    await interaction.editReply({ content: "An error occurred during setup. Please try again later." });
  }
}
