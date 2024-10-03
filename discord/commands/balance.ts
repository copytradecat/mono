import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import User from '../../src/models/User';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import { getBalance } from "../../src/services/jupiter.service";

dotenv.config({ path: ['../.env.local', '.env'] });

export async function handleBalance(userId: string, reply: (content: string) => Promise<void>) {
  try {
    const user = await User.findOne({ discordId: userId });
    if (!user || user.wallets.length === 0) {
      return reply("You don't have any wallets linked to your account.");
    }

    const limit = pLimit(5); // Limit to 5 concurrent requests

    const balancePromises = user.wallets.map((wallet: { publicKey: string }) =>
      limit(async () => {
        const balanceLamports = await getBalance(wallet.publicKey);
        const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
        return `${wallet.publicKey}: ${balanceSOL.toFixed(6)} SOL`;
      })
    );

    const balances = await Promise.all(balancePromises);
    await reply(`Your wallet balances:\n${balances.join('\n')}`);
  } catch (error) {
    console.error("Error in balance command:", error);
    await reply("An error occurred while fetching your balance information.");
  }
}
