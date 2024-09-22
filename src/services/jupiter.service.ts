import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';
import { RateLimiter } from 'limiter';

dotenv.config({ path: ['.env.local', '.env'] });

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

// Create a rate limiter that allows 10 requests per second
const limiter = new RateLimiter({ tokensPerInterval: 10, interval: 'second' });

async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  await limiter.removeTokens(1);
  return fn();
}

export async function getTokenBalances(publicKey: string) {
  try {
    const pubKey = new PublicKey(publicKey);
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

    // Fetch SOL balance
    const solBalance = await rateLimitedRequest(() => connection.getBalance(pubKey));

    // Fetch all token accounts
    const tokenAccounts = await rateLimitedRequest(() => 
      connection.getParsedTokenAccountsByOwner(pubKey, {
        programId: TOKEN_PROGRAM_ID
      })
    );

    // Filter out accounts with zero balance
    const nonZeroAccounts = tokenAccounts.value.filter(
      account => account.account.data.parsed.info.tokenAmount.uiAmount > 0
    );

    // Batch token balance requests
    const batchSize = 100; // Adjust this based on your rate limit
    const balances: { [key: string]: number } = {
      SOL: solBalance / LAMPORTS_PER_SOL
    };

    for (let i = 0; i < nonZeroAccounts.length; i += batchSize) {
      const batch = nonZeroAccounts.slice(i, i + batchSize);
      const batchPromises = batch.map(account => 
        rateLimitedRequest(() => connection.getTokenAccountBalance(account.pubkey))
      );
      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((result, index) => {
        const mintAddress = batch[index].account.data.parsed.info.mint;
        balances[mintAddress] = result.value.uiAmount || 0;
      });

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < nonZeroAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Fetch token metadata for non-zero balances
    const tokenMetadata = await getTokenMetadata(Object.keys(balances).filter(key => key !== 'SOL'));

    return { balances, metadata: tokenMetadata };
  } catch (error) {
    console.error('Error fetching token balances:', error);
    throw error;
  }
}

async function getTokenMetadata(mintAddresses: string[]) {
  const metadata: { [key: string]: { symbol: string, name: string } } = {};
  const metadataPromises = mintAddresses.map(async (address) => {
    try {
      const response = await fetch(`https://api.jup.ag/v4/token/${address}`);
      if (response.ok) {
        const data = await response.json();
        metadata[address] = { symbol: data.symbol, name: data.name };
      }
    } catch (error) {
      console.error(`Error fetching metadata for token ${address}:`, error);
    }
  });

  await Promise.all(metadataPromises);
  return metadata;
}

export async function getAggregateBalance(wallets: string[]) {
  const aggregateBalance: { [key: string]: number } = {};

  for (const wallet of wallets) {
    try {
      const { balances } = await getTokenBalances(wallet);
      for (const [token, balance] of Object.entries(balances)) {
        aggregateBalance[token] = (aggregateBalance[token] || 0) + balance;
      }
    } catch (error) {
      console.error(`Error fetching balance for wallet ${wallet}:`, error);
    }
    // Add a small delay between processing each wallet
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return aggregateBalance;
}


export async function getQuote(inputToken: string, outputToken: string, amount: number): Promise<any> {
  const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
  quoteUrl.searchParams.append('inputMint', inputToken);
  quoteUrl.searchParams.append('outputMint', outputToken);
  quoteUrl.searchParams.append('amount', amount.toString());
  quoteUrl.searchParams.append('slippageBps', '50');

  const response = await fetch(quoteUrl.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get quote: ${await response.text()}`);
  }

  return response.json();
}

export async function getSwapTransaction(quoteResponse: any, userPublicKey: string): Promise<any> {
  const response = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapUnwrapSOL: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get swap transaction: ${await response.text()}`);
  }

  return response.json();
}

export async function executeSwap(connection: Connection, swapTransaction: string, signer: any): Promise<string> {
  const transaction = Transaction.from(Buffer.from(swapTransaction, 'base64'));
  return await connection.sendTransaction(transaction, [signer]);
}
