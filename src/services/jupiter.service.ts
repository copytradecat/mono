import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import dotenv from 'dotenv';
import { RateLimiter } from 'limiter';
import { Metaplex, token } from '@metaplex-foundation/js';
import { Transaction } from '@solana/web3.js';
import { createJupiterApiClient, QuoteGetRequest, QuoteResponse } from '@jup-ag/api';
import { Settings } from '../components/BotSettings';
import pLimit from 'p-limit';

dotenv.config({ path: ['.env.local', '.env'] });

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
const jupiterApiClient = createJupiterApiClient({ basePath: process.env.NEXT_PUBLIC_SOLANA_RPC_URL_INFURA! });
const metaplex = Metaplex.make(connection);

const requestLimit = pLimit(10); // Limit to 10 concurrent requests
export async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  // Ensure the limiter is correctly set up
  // const { RateLimiter } = Limiter;
  const limiter = new RateLimiter({ tokensPerInterval: 5, interval: 'second' });
  await limiter.removeTokens(1);
  return await fn();
}
async function rateLimitedRequestWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  // const { RateLimiter } = Limiter;
  const limiter = new RateLimiter({ tokensPerInterval: 5, interval: 'second' });
  try {
    await limiter.removeTokens(1);
    return await fn();
  } catch (error) {
    if (retries > 0 && error.message.includes('429')) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return rateLimitedRequestWithRetry(fn, retries - 1, delay * 2);
    } else {
      throw error;
    }
  }
}

interface TokenMetadata {
  symbol: string;
  name: string;
  uri: string;
  address: string;
  decimals: number;
}

const tokenMetadataCache: {
  [address: string]: { metadata: TokenMetadata; lastUpdated: number };
} = {};

async function getTokenMetadata(mintAddresses: string[]): Promise<{ [key: string]: TokenMetadata }> {
  const metadata: { [key: string]: TokenMetadata } = {};

  const metadataPromises = mintAddresses.map(async (address) => {
    try {
      // Check if metadata is in cache and not expired
      const cachedEntry = tokenMetadataCache[address];
      const cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
      if (cachedEntry && (Date.now() - cachedEntry.lastUpdated) < cacheTTL) {
        metadata[address] = cachedEntry.metadata;
        return;
      }

      const mintPublicKey = new PublicKey(address);
      const nft = await metaplex.nfts().findByMint({ mintAddress: mintPublicKey });

      const tokenMeta: TokenMetadata = {
        symbol: nft.symbol,
        name: nft.name,
        uri: nft.uri,
        address: address,
        decimals: nft.mint.decimals,
      };

      metadata[address] = tokenMeta;

      // Cache the metadata
      tokenMetadataCache[address] = { metadata: tokenMeta, lastUpdated: Date.now() };
    } catch (error) {
      console.error(`Error fetching metadata for token ${address}:`, error);
      // Fallback to Jupiter API if Metaplex fails
      try {
        const tokenInfo = await getTokenInfo(address);
        const tokenMeta: TokenMetadata = {
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
          uri: tokenInfo.logoURI,
          address: address,
          decimals: tokenInfo.decimals,
        };

        metadata[address] = tokenMeta;

        // Cache the metadata
        tokenMetadataCache[address] = { metadata: tokenMeta, lastUpdated: Date.now() };
      } catch (fallbackError) {
        console.error(`Fallback error fetching metadata for token ${address}:`, fallbackError);
      }
    }
  });

  await Promise.all(metadataPromises);
  return metadata;
}

const tokenInfoCache: {
  [address: string]: { info: any; lastUpdated: number };
} = {};

export async function getTokenInfo(tokenAddress: string): Promise<any> {
  const cachedEntry = tokenInfoCache[tokenAddress];
  const cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  if (cachedEntry && (Date.now() - cachedEntry.lastUpdated) < cacheTTL) {
    return cachedEntry.info;
  }

  // Fetch token info from the source
  const tokenInfo = await fetchTokenInfo(tokenAddress);

  // Cache the info with a timestamp
  tokenInfoCache[tokenAddress] = { info: tokenInfo, lastUpdated: Date.now() };

  return tokenInfo;
}

async function fetchTokenInfo(tokenAddress: string): Promise<any> {
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
    console.error('Error fetching token info:', error instanceof Error ? error.message : String(error));
    throw error; // Re-throw the error after logging
  }
}

// Fetches the balances for a single wallet
export async function getTokenBalances(publicKey: string) {
  try {
    const pubKey = new PublicKey(publicKey);

    // Fetch SOL balance
    const solBalancePromise = rateLimitedRequest(() => connection.getBalance(pubKey));

    // Fetch token accounts
    const tokenAccountsResponse = await rateLimitedRequest(() =>
      connection.getParsedTokenAccountsByOwner(pubKey, { programId: TOKEN_PROGRAM_ID })
    );

    const tokenAccounts = tokenAccountsResponse.value;

    // Fetch token balances using p-limit
    const tokenBalancesPromises = tokenAccounts.map((accountInfo) =>
      requestLimit(async () => {
        const mintAddress = accountInfo.account.data.parsed.info.mint;
        const tokenAmountData = accountInfo.account.data.parsed.info.tokenAmount;

        const decimals = tokenAmountData.decimals;
        const amount = parseFloat(tokenAmountData.amount) / Math.pow(10, decimals);

        return { mintAddress, amount, decimals };
      })
    );

    const tokenBalancesArray = await Promise.all(tokenBalancesPromises);

    // Build balances object
    const balances: { [key: string]: number } = {};

    // Include SOL balance
    balances['SOL'] = (await solBalancePromise) / LAMPORTS_PER_SOL;

    // Include token balances
    tokenBalancesArray.forEach(({ mintAddress, amount }) => {
      balances[mintAddress] = amount;
    });

    // Fetch token metadata
    const tokenMintAddresses = tokenBalancesArray.map((t) => t.mintAddress);
    const tokenMetadata = await getTokenMetadata(tokenMintAddresses);

    return { balances, metadata: tokenMetadata };
  } catch (error) {
    console.error('Error fetching token balances:', error);
    throw error;
  }
}

export async function getAggregateBalance(wallets: string[]) {
  const aggregateBalance: { [key: string]: number } = {};
  const limit = pLimit(5); // Adjust concurrency limit based on your needs

  await Promise.all(
    wallets.map((walletAddress) =>
      limit(async () => {
        try {
          // Fetch token balances for the wallet
          const { balances } = await getTokenBalances(walletAddress);

          // Aggregate balances
          for (const [token, balance] of Object.entries(balances)) {
            aggregateBalance[token] = (aggregateBalance[token] || 0) + balance;
          }
        } catch (error) {
          console.error(`Error fetching balances for wallet ${walletAddress}:`, error);
        }
      })
    )
  );

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
    ...(settings.slippageType === 'fixed' && {slippageBps: settings.slippage}),
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
  return await rateLimitedRequest(() => connection.sendTransaction(transaction));
}

export async function getTokenBalance(walletAddress: string, tokenAddress: string): Promise<{
  balance: number;
  decimals: number;
  symbol: string;
}> {
  const walletPublicKey = new PublicKey(walletAddress);
  const tokenPublicKey = new PublicKey(tokenAddress);

  const tokenAccounts = await rateLimitedRequest(() =>
    connection.getParsedTokenAccountsByOwner(walletPublicKey, {
      mint: tokenPublicKey,
    })
  );

  const tokenMetadata = await getTokenMetadata([tokenAddress]);
  const { decimals, symbol } = tokenMetadata[tokenAddress];
  let balance = 0;

  if (tokenAccounts.value.length > 0) {
    const tokenAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
    balance = parseFloat(tokenAmount.amount) / Math.pow(10, decimals);
  }

  return { balance, decimals, symbol };
}

//  Fetches the balance of a specific token for multiple wallets
export async function getBalancesForWallets(
  walletAddresses: string[],
  tokenAddress: string
): Promise<{ [walletAddress: string]: number }> {
  const balances: { [walletAddress: string]: number } = {};
  const limit = pLimit(5); // Limit to 5 concurrent requests

  await Promise.all(
    walletAddresses.map((walletAddress) =>
      limit(async () => {
        if (tokenAddress === 'So11111111111111111111111111111111111111112' || 'SOL') {
          // Fetch SOL balance
          const balanceLamports = await rateLimitedRequest(() =>
            connection.getBalance(new PublicKey(walletAddress))
          );
          balances[walletAddress] = balanceLamports / LAMPORTS_PER_SOL;
        } else {
          // Fetch SPL Token balance
          const { balance } = await rateLimitedRequest(() =>
            getTokenBalance(walletAddress, tokenAddress)
          );
          balances[walletAddress] = balance;
        }
      })
    )
  );

  return balances;
}

export async function getMultipleTokenBalances(
  walletAddress: string,
  tokenAddresses: string[]
): Promise<{ [tokenAddress: string]: number }> {
  const balances: { [tokenAddress: string]: number } = {};
  const limit = pLimit(10); // Limit to 10 concurrent requests

  await Promise.all(
    tokenAddresses.map((tokenAddress) =>
      limit(async () => {
        const { balance } = await rateLimitedRequest(() =>
          getTokenBalance(walletAddress, tokenAddress)
        );
        balances[tokenAddress] = balance;
      })
    )
  );

  return balances;
}

function parseTokenAccountData(data: Buffer): { amount: number } {
  const accountInfo = AccountLayout.decode(data);
  const amount = Number(accountInfo.amount);
  return { amount };
}

//  Fetches balances of multiple tokens across multiple wallets
export async function getMultipleTokenBalancesForWallets(
  walletAddresses: string[],
  tokenAddresses: string[]
): Promise<{ [walletAddress: string]: { [tokenAddress: string]: number } }> {
  const limit = pLimit(10); // Limit to 10 concurrent requests
  const balances: { [walletAddress: string]: { [tokenAddress: string]: number } } = {};

  await Promise.all(
    walletAddresses.map((walletAddress) =>
      limit(async () => {
        const walletBalances = await getMultipleTokenBalances(walletAddress, tokenAddresses);
        balances[walletAddress] = walletBalances;
      })
    )
  );

  return balances;
}