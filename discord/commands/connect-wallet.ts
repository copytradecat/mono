import { CommandInteraction } from "discord.js";
import User from '../../src/models/User';
import dotenv from 'dotenv';

dotenv.config({ path: ['../.env.local', '../.env'] });

export async function handleConnectWallet(interaction: CommandInteraction) {
  const userId = interaction.user.id;

  try {
    const user = await User.findOne({ discordId: userId });
    if (!user || user.wallets.length === 0) {
      return interaction.reply({
        content: "You don't have any wallets linked to your account. Please visit our web application to set up your wallets: " + process.env.NEXT_PUBLIC_WEBSITE_URL,
        ephemeral: true
      });
    }

    // Here you would typically implement logic to select a wallet and connect it to the channel
    // For now, we'll just display the available wallets

    const walletList = user.wallets.map((wallet, index) => 
      `${index + 1}. ${wallet.publicKey}`
    ).join('\n');

    await interaction.reply({
      content: `Your linked wallets:\n${walletList}\n\nTo connect a wallet, please use our web application: ${process.env.NEXT_PUBLIC_WEBSITE_URL}`,
      ephemeral: true
    });
  } catch (error) {
    console.error("Error in connect-wallet command:", error);
    await interaction.reply({ content: "An error occurred while fetching your wallet information.", ephemeral: true });
  }
}
