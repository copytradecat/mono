import { CommandInteraction } from "discord.js";
import User from '../../src/models/User';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import { getTokenBalances } from '../../src/services/jupiter.service';
import '../../env.ts';

export async function handleProfile(interaction: CommandInteraction) {
  try {
    const user = await User.findOne({ discordId: interaction.user.id });
    if (!user || !user.wallets || user.wallets.length === 0) {
      return interaction.reply("You haven't connected any wallets yet. Please visit our website to connect your wallet.");
    }

    const walletAddress = user.wallets[0].publicKey;
    const publicKey = new PublicKey(walletAddress);

    const tokenAccounts = await getTokenBalances(publicKey);

    const balances = tokenAccounts.value.map((accountInfo) => ({
      mint: accountInfo.account.data.parsed.info.mint,
      balance: accountInfo.account.data.parsed.info.tokenAmount.uiAmount,
    }));

    let replyMessage = `Your wallet (${walletAddress}):\n\nToken Balances:\n`;
    balances.forEach((token) => {
      replyMessage += `${token.mint}: ${token.balance}\n`;
    });

    await interaction.reply({ content: replyMessage, ephemeral: true });
  } catch (error) {
    console.error("Error in profile command:", error);
    await interaction.reply({ content: "An error occurred while fetching your profile information.", ephemeral: true });
  }
}
