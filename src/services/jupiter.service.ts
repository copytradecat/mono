import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';
import { RateLimiter } from 'limiter';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import fetch from 'node-fetch';
import { Transaction } from '@solana/web3.js';

dotenv.config({ path: ['.env.local', '.env'] });

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

// Create a rate limiter that allows 10 requests per second
const limiter = new RateLimiter({ tokensPerInterval: 10, interval: 'second' });

async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  await limiter.removeTokens(1);
  return fn();
}

async function getTokenMetadata(mintAddresses: string[]) {
  const metadata: { [key: string]: { symbol: string, name: string, uri: string, address: string } } = {};

  const metadataPromises = mintAddresses.map(async (address) => {
    try {
      const mintPublicKey = new PublicKey(address);
      const metadataPDA = await Metadata.getPDA(mintPublicKey);
      const metadataAccount = await Metadata.load(connection, metadataPDA);

      metadata[address] = {
        symbol: metadataAccount.data.symbol,
        name: metadataAccount.data.name,
        uri: metadataAccount.data.uri,
        address: address,
      };
    } catch (error) {
      console.error(`Error fetching metadata for token ${address}:`, error);
      // Fallback to Jupiter API if Metaplex fails
      try {
        const response = await fetch(`https://api.jup.ag/v4/token/${address}`);
        if (response.ok) {
          const data = await response.json();
          metadata[address] = { symbol: data.symbol, name: data.name, uri: data.uri, address: address };
        }
      } catch (fallbackError) {
        console.error(`Fallback error fetching metadata for token ${address}:`, fallbackError);
      }
    }
  });

  await Promise.all(metadataPromises);
  return metadata;
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

    console.log("Token Accounts:", tokenAccounts);

    const balances: { [key: string]: number } = {
      SOL: solBalance / LAMPORTS_PER_SOL
    };

    // Batch token balance requests
    const batchSize = 100;
    for (let i = 0; i < tokenAccounts.value.length; i += batchSize) {
      const batch = tokenAccounts.value.slice(i, i + batchSize);
      const batchPromises = batch.map(account => 
        rateLimitedRequest(() => connection.getTokenAccountBalance(account.pubkey))
      );
      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((result, index) => {
        const mintAddress = batch[index].account.data.parsed.info.mint;
        balances[mintAddress] = result.value.uiAmount || 0;
      });

      console.log(`Batch ${i / batchSize + 1} Balances:`, balances);

      if (i + batchSize < tokenAccounts.value.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Fetch token metadata for all balances
    const tokenMetadata = await getTokenMetadata(Object.keys(balances).filter(key => key !== 'SOL'));

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
  quoteUrl.searchParams.append('amount', Math.floor(amount * 1e9).toString()); // Convert to lamports
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
  const { VersionedTransaction } = await import('@solana/web3.js');
  const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  if (!transaction.sign) {
    throw new Error('Transaction is not a VersionedTransaction');
  }
  transaction.sign([signer]);
  return await connection.sendTransaction(transaction);
}
