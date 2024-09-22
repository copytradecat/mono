import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';
import { RateLimiter } from 'limiter';

dotenv.config({ path: ['.env.local', '.env'] });

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

// Create a rate limiter that allows 10 requests per second
const limiter = new RateLimiter({ tokensPerInterval: 10, interval: 'second' });

export async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  await limiter.removeTokens(1);
  return fn();
}

export async function getTokenBalances(publicKey: string) {
  try {
    const pubKey = new PublicKey(publicKey);
    const tokenAccounts = await rateLimitedRequest(() => 
      connection.getParsedTokenAccountsByOwner(pubKey, {
        programId: TOKEN_PROGRAM_ID
      })
    );

    const balances: { [key: string]: number } = {};

    for (const account of tokenAccounts.value) {
      const mintAddress = account.account.data.parsed.info.mint;
      const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
      balances[mintAddress] = balance;
    }

    return balances;
  } catch (error) {
    console.error('Error fetching token balances:', error);
    throw error;
  }
}

export async function getAggregateBalance(wallets: string[]) {
  const aggregateBalance: { [key: string]: number } = {};

  for (const wallet of wallets) {
    try {
      const publicKey = new PublicKey(wallet);
      const solBalance = await rateLimitedRequest(() => connection.getBalance(publicKey));
      aggregateBalance['SOL'] = (aggregateBalance['SOL'] || 0) + solBalance / LAMPORTS_PER_SOL;

      const tokenBalances = await getTokenBalances(wallet);
      for (const [mint, balance] of Object.entries(tokenBalances)) {
        aggregateBalance[mint] = (aggregateBalance[mint] || 0) + balance;
      }
    } catch (error) {
      console.error(`Error fetching balance for wallet ${wallet}:`, error);
    }
    // Add a small delay between processing each wallet
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return aggregateBalance;
}