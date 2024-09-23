import { Connection, PublicKey } from "@solana/web3.js";
import User from '../../models/User';
import dotenv from 'dotenv';
import { rateLimitedRequest } from '../../services/jupiter.service';

dotenv.config({ path: ['.env.local', '.env'] });

export async function handleBalance(userId: string, reply: (content: string) => Promise<void>) {
  try {
    const user = await User.findOne({ discordId: userId });
    if (!user || user.wallets.length === 0) {
      return reply("You don't have any wallets linked to your account.");
    }
    
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    
    const balancePromises = user.wallets.map(async (wallet: { publicAddress: string }) => {
      const publicKey = new PublicKey(wallet.publicAddress);
      const balance = await rateLimitedRequest(() => connection.getBalance(publicKey));
      return `${wallet.publicAddress}: ${balance / LAMPORTS_PER_SOL} SOL`;
    });
    
    const balances = await Promise.all(balancePromises);
    reply(`Your wallet balances:\n${balances.join('\n')}`);
  } catch (error) {
    console.error("Error in balance command:", error);
    reply("An error occurred while fetching your balance information.");
  }
}
