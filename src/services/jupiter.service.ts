import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';
import { RateLimiter } from 'limiter';
import { Metaplex, token } from '@metaplex-foundation/js';
import { Transaction } from '@solana/web3.js';
import { createJupiterApiClient, QuoteGetRequest, QuoteResponse } from '@jup-ag/api';
import { Settings } from '../components/BotSettings';

dotenv.config({ path: ['.env.local', '.env'] });

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
const jupiterApiClient = createJupiterApiClient({ basePath: process.env.NEXT_PUBLIC_SOLANA_RPC_URL_INFURA! });
const metaplex = Metaplex.make(connection);


export async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  // Ensure the limiter is correctly set up
  // const { RateLimiter } = Limiter;
  const limiter = new RateLimiter({ tokensPerInterval: 5, interval: 'second' });
  await limiter.removeTokens(1);
  return fn();
}

async function getTokenMetadata(mintAddresses: string[]) {
  const metadata: { [key: string]: { symbol: string; name: string; uri: string; address: string; decimals: number } } = {};

  const metadataPromises = mintAddresses.map(async (address) => {
    try {
      const mintPublicKey = new PublicKey(address);
      const nft = await metaplex.nfts().findByMint({ mintAddress: mintPublicKey }).run();

      metadata[address] = {
        symbol: nft.symbol,
        name: nft.name,
        uri: nft.uri,
        address: address,
        decimals: nft.mint.decimals,
      };
    } catch (error) {
      console.error(`Error fetching metadata for token ${address}:`, error);
      // Fallback to Jupiter API if Metaplex fails
      try {
        const response = await fetch(`https://api.jup.ag/v4/token/${address}`);
        if (response.ok) {
          const data = await response.json();
          metadata[address] = {
            symbol: data.symbol,
            name: data.name,
            uri: data.uri,
            address: address,
            decimals: data.decimals,
          };
        }
      } catch (fallbackError) {
        console.error(`Fallback error fetching metadata for token ${address}:`, fallbackError);
      }
    }
  });

  await Promise.all(metadataPromises);
  return metadata;
}


export async function getTokenInfo(tokenAddress: string) {
  if (tokenAddress === 'So11111111111111111111111111111111111111112') {
    return {"address":"So11111111111111111111111111111111111111112","name":"Wrapped SOL","symbol":"SOL","decimals":9,"logoURI":"https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png","tags":["verified","community","strict"],"daily_volume":119732114.11683102,"created_at":"2024-04-26T10:56:58.893768Z","freeze_authority":null,"mint_authority":null,"permanent_delegate":null,"minted_at":null,"extensions":{"coingeckoId":"wrapped-solana"}};
  }
  try {
    const response = await fetch(`https://api.jup.ag/tokens/v1/${tokenAddress}`,
      { method: 'GET', headers: {accept: 'application/json'}});

    if (!response.ok) {
      throw new Error(`Failed to fetch token info for ${tokenAddress}
        \nResponse status: ${response.status}`);
    }
    const data = await response.json();
    console.log(data);
    return data;
  } catch (error) {
    console.error(error.message);
  }

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

export async function getQuote(inputToken: string, outputToken: string, amount: number, slippageSettings: { type: 'fixed' | 'dynamic', value?: number }): Promise<QuoteResponse> {
  const baseParams: QuoteGetRequest = {
    inputMint: inputToken,
    outputMint: outputToken,
    amount: amount,
  };

  const params: QuoteGetRequest = slippageSettings.type === 'fixed' 
    ? {
        ...baseParams,
        slippageBps: Math.floor(slippageSettings.value!),
      }
    : {
        ...baseParams,
        autoSlippage: true,
        autoSlippageCollisionUsdValue: 1_000,
        maxAutoSlippageBps: 1000, // 10%
        minimizeSlippage: true,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      };

  try {
    const quote = await jupiterApiClient.quoteGet(params);

    if (!quote) {
      throw new Error('Failed to get quote');
    }

    return quote;
  } catch (error) {
    console.error('Error getting quote:', error);
    throw error;
  }
}

export async function getSwapTransaction(
  quoteResponse: QuoteResponse,
  userPublicKey: string,
  settings: Settings
): Promise<any> {
  const { transactionSpeed, priorityFee, wrapUnwrapSOL } = settings;
  const swapRequest = {
    quoteResponse,
    userPublicKey,
    wrapUnwrapSOL,
    asLegacyTransaction: false,
    dynamicComputeUnitLimit: true,
    // prioritizationFeeLamports: priorityFee === 'auto' ? 'auto' : priorityFee * LAMPORTS_PER_SOL,
    computeUnitPriceMicroLamports: transactionSpeed === 'medium' ? 0 : "auto",
    ...(settings.slippageType === 'dynamic' && {dynamicSlippage: {maxBps:300}}),
  };

  const swapTransaction = await jupiterApiClient.swapPost({
    swapRequest,
  });

  if (!swapTransaction) {
    throw new Error('Failed to get swap transaction');
  }

  return swapTransaction;
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

export async function getTokenBalance(walletAddress: string, tokenAddress: string): Promise<{
  balance: number;
  decimals: number;
}> {
  const walletPublicKey = new PublicKey(walletAddress);
  const tokenPublicKey = new PublicKey(tokenAddress);

  const tokenAccounts = await rateLimitedRequest(() =>
    connection.getParsedTokenAccountsByOwner(walletPublicKey, {
      mint: tokenPublicKey,
    })
  );

  if (tokenAccounts.value.length === 0) {
    return { balance: 0, decimals: 0 };
  }

  const tokenAccount = tokenAccounts.value[0].account.data.parsed.info;
  const balance = parseFloat(tokenAccount.tokenAmount.uiAmount);
  const decimals = tokenAccount.tokenAmount.decimals;

  return { balance, decimals };
}