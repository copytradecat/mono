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
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

    // Fetch SOL balance
    const solBalance = await rateLimitedRequest(() => connection.getBalance(pubKey));

    // Fetch token accounts
    const tokenAccounts = await rateLimitedRequest(() => 
      connection.getParsedTokenAccountsByOwner(pubKey, {
        programId: TOKEN_PROGRAM_ID
      })
    );

    const balances: { [key: string]: number } = {
      SOL: solBalance / LAMPORTS_PER_SOL
    };

    for (const account of tokenAccounts.value) {
      const mintAddress = account.account.data.parsed.info.mint;
      const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
      balances[mintAddress] = balance;
    }

    // Fetch token metadata (you may need to implement this function)
    const tokenMetadata = await getTokenMetadata(Object.keys(balances));

    return { balances, metadata: tokenMetadata };
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

async function getTokenMetadata(mintAddresses: string[]) {
  // You can use the Solana Token List API or another service like Jupiter API to fetch token metadata
  // This is a placeholder implementation
  const metadata: { [key: string]: { symbol: string, name: string } } = {};
  for (const address of mintAddresses) {
    try {
      const response = await fetch(`https://api.jup.ag/v4/token/${address}`);
      if (response.ok) {
        const data = await response.json();
        metadata[address] = { symbol: data.symbol, name: data.name };
      }
    } catch (error) {
      console.error(`Error fetching metadata for token ${address}:`, error);
    }
  }
  return metadata;
}
