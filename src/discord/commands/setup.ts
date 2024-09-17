import { CommandInteraction, TextChannel, PermissionFlagsBits } from "discord.js";
import Channel from '../../models/Channel';

export async function handleSetup(interaction: CommandInteraction) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "This command can only be used by administrators in a server.", ephemeral: true });
  }

  const tradingChannel = interaction.options.getChannel('channel') as TextChannel;
  if (!tradingChannel || tradingChannel.type !== 'GUILD_TEXT') {
    return interaction.reply({ content: "Please select a valid text channel.", ephemeral: true });
  }

  try {
    await Channel.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { 
        $set: { 
          channelId: tradingChannel.id,
          settings: { maxTradeAmount: 100 }
        }
      },
      { upsert: true, new: true }
    );

    await interaction.reply({
      content: `Setup complete! ${tradingChannel} is now configured for CopyTradeCat commands. 
      Members can now connect their wallets using the \`/connect-wallet\` command.`,
      ephemeral: true
    });

    await tradingChannel.send("This channel has been set up for CopyTradeCat trading. Use `/connect-wallet` to get started!");
  } catch (error) {
    console.error("Error in setup:", error);
    await interaction.reply({ content: "An error occurred during setup. Please try again later.", ephemeral: true });
  }
}
