import { CommandInteraction } from "discord.js";
import User from '../../src/models/User';
import { getTokenBalances } from '../../src/services/jupiter.service';
import { Connection, PublicKey } from '@solana/web3.js';
import { rateLimitedRequest } from '../../src/services/jupiter.service';

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

export async function handleInfo(interaction: CommandInteraction) {
  try {
    const user = await User.findOne({ name: interaction.user.id });
    
    if (!user || user.wallets.length === 0) {
      return interaction.reply("You don't have any wallets linked to your account. Please visit our web application to set up your wallets.");
    }

    let infoMessage = "Your Wallet Information:\n\n";

    for (const wallet of user.wallets) {
      const publicKey = new PublicKey(wallet.publicKey);
      const solBalance = await rateLimitedRequest(() => connection.getBalance(publicKey));
      const tokenBalances = await getTokenBalances(wallet.publicKey);

      infoMessage += `Wallet: ${wallet.publicKey}\n`;
      infoMessage += `SOL Balance: ${solBalance / 1e9} SOL\n`;
      infoMessage += "Token Balances:\n";
      
      for (const [token, balance] of Object.entries(tokenBalances)) {
        infoMessage += `  ${token}: ${balance}\n`;
      }

      infoMessage += `Connected Channels: ${wallet.connectedChannels.join(', ') || 'None'}\n\n`;
    }

    infoMessage += `\nFor more details, visit your dashboard: ${process.env.NEXT_PUBLIC_WEBSITE_URL}/dashboard\n`;

    await interaction.reply({ content: infoMessage, ephemeral: true });
  } catch (error) {
    console.error("Error in info command:", error);
    await interaction.reply({ content: "An error occurred while fetching your information.", ephemeral: true });
  }
}
