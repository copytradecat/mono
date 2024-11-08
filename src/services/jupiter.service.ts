import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, AccountLayout } from '@solana/spl-token';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import { Metaplex, token } from '@metaplex-foundation/js';
import { Transaction } from '@solana/web3.js';
import { createJupiterApiClient, QuoteGetRequest, QuoteResponse } from '@jup-ag/api';
import { Settings } from '../config/defaultSettings';
import limiter from '../lib/limiter';
import { exponentialBackoff, getRandomSolanaRpcUrl, getRandomJupiterApiUrl, executeWithFallback, jupiterApiUrls, getConnection, solanaRpcUrls } from '../lib/utils';
import '../../env.ts';

let connection: Connection;

const requestLimit = pLimit(8); // Limit to 8 concurrent requests

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
      
      await executeWithFallback(async (url) => {
        const conn = new Connection(url);

        const metaplex = Metaplex.make(conn);
        const mintPublicKey = new PublicKey(address);
        const uniqueJobId = `get-token-metadata-${address}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const nft = await limiter.schedule({id: uniqueJobId}, async () => await metaplex.nfts().findByMint({ mintAddress: mintPublicKey }));
  
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

      }, solanaRpcUrls);
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

const tokenInfoCache: { [address: string]: { info: any; lastUpdated: number } } = {};

export async function getTokenInfo(tokenAddress: string): Promise<any> {
  const cachedEntry = tokenInfoCache[tokenAddress];
  const cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  if (cachedEntry && Date.now() - cachedEntry.lastUpdated < cacheTTL) {
    return cachedEntry.info;
  }

  // Fetch token info from the source
  const tokenInfo = await fetchTokenInfo(tokenAddress);

  tokenInfoCache[tokenAddress] = { info: tokenInfo, lastUpdated: Date.now() };
  return tokenInfo;
}

async function fetchTokenInfo(tokenAddress: string): Promise<any> {
  if (tokenAddress === 'So11111111111111111111111111111111111111112') {
    return {"address":"So11111111111111111111111111111111111111112","name":"Wrapped SOL","symbol":"SOL","decimals":9,"logoURI":"https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png","tags":["verified","community","strict"],"daily_volume":119732114.11683102,"created_at":"2024-04-26T10:56:58.893768Z","freeze_authority":null,"mint_authority":null,"permanent_delegate":null,"minted_at":null,"extensions":{"coingeckoId":"wrapped-solana"}};
  }
  try {
    const uniqueJobId = `fetch-token-info-${tokenAddress}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return await limiter.schedule({id: uniqueJobId}, async () => {
      const response = await fetch(`https://api.jup.ag/tokens/v1/${tokenAddress}`,
        { method: 'GET', headers: {accept: 'application/json'}});

      if (!response.ok) {
        throw new Error(`Failed to fetch token info for ${tokenAddress}
          \nResponse status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    });
  } catch (error) {
    console.error('Error fetching token info:', error instanceof Error ? error.message : String(error));
    throw error; // Re-throw the error after logging
  }
}


export async function getBalance(publicKey: string): Promise<number> {
  return await executeWithFallback(async (url) => {
    const conn = await getConnection();
    const uniqueJobId = `get-balance-${publicKey}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return await limiter.schedule({ id: uniqueJobId }, async () => {
      return conn.getBalance(new PublicKey(publicKey));
    });
  }, solanaRpcUrls);
}

// Fetches the balances for a single wallet
export async function getTokenBalances(publicKey: string) {
  try {
    const pubKey = new PublicKey(publicKey);

    // Fetch SOL balance
    const solBalancePromise = getBalance(publicKey);

    // Fetch token accounts
    const tokenAccountsResponse = await limiter.schedule({id: `get-token-accounts-${publicKey}-${Date.now()}-${Math.random().toString(36).substring(7)}`}, async () => {
      return executeWithFallback(async (url) => {
        const conn = new Connection(url);
        return await conn.getParsedTokenAccountsByOwner(pubKey, {
          programId: TOKEN_PROGRAM_ID,
        });
      }, solanaRpcUrls);
    });

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
  const limit = pLimit(8); // Adjust concurrency limit based on your needs

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

export async function getQuote(
  inputToken: string,
  outputToken: string,
  amount: number,
  slippageSettings: { type: 'fixed' | 'dynamic'; value?: number }
): Promise<QuoteResponse> {
  return executeWithFallback(async (apiUrl) => {
    const jupiterApiClient = createJupiterApiClient({ basePath: apiUrl });
    const baseParams: QuoteGetRequest = {
      inputMint: inputToken,
      outputMint: outputToken,
      amount: amount,
    };

    const uniqueJobId = `get-quote-${inputToken}-${outputToken}-${amount}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return await limiter.schedule(
      { id: uniqueJobId },
      async () => {
        return await jupiterApiClient.quoteGet({
          ...baseParams,
          ...(slippageSettings.type === 'dynamic' && {
            autoSlippage: true,
            autoSlippageCollisionUsdValue: 1_000,
            maxAutoSlippageBps: 1000, // 10%
            onlyDirectRoutes: false,
            asLegacyTransaction: false,
          }),
          ...(slippageSettings.type === 'fixed' && {
            slippageBps: slippageSettings.value,
          }),
        });
      }
    );
  }, jupiterApiUrls);
}

export async function getSwapTransaction(
  quoteResponse: QuoteResponse,
  userPublicKey: string,
  settings: Settings
): Promise<any> {
  // For small amounts, increase slippage tolerance
  const isSmallAmount = Number(quoteResponse.inAmount) < 5000; // Adjust threshold as needed
  const slippageMultiplier = isSmallAmount ? 2 : 1;
  
  const swapRequest = {
    quoteResponse,
    userPublicKey,
    wrapUnwrapSOL: settings.wrapUnwrapSOL,
    asLegacyTransaction: false,
    dynamicComputeUnitLimit: true,
    computeUnitPriceMicroLamports: settings.transactionSpeed === 'medium' ? 0 : "auto",
    ...(settings.slippageType === 'dynamic' && {
      dynamicSlippage: {
        maxBps: (settings.slippage || 300) * slippageMultiplier
      }
    }),
    ...(settings.slippageType === 'fixed' && {
      slippageBps: settings.slippage * slippageMultiplier
    }),
  };

  return await executeWithFallback(async (apiUrl) => {
    const jupiterApiClient = createJupiterApiClient({ basePath: apiUrl });
    const uniqueJobId = `get-swap-transaction-${userPublicKey}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const swapTransaction = await limiter.schedule({ id: uniqueJobId }, async () => {
      return await jupiterApiClient.swapPost({
        swapRequest,
      });
    });

    if (!swapTransaction) {
      throw new Error('Failed to get swap transaction');
    }
    console.log('Generated swap transaction:', {
      swapTransaction: swapTransaction ? 'present' : 'missing',
      length: swapTransaction ? JSON.stringify(swapTransaction).length : 0
    });
    return swapTransaction;
  }, jupiterApiUrls);
}

export async function getTokenBalance(
  walletAddress: string,
  tokenAddress: string
): Promise<{ balance: number; decimals: number; symbol: string }> {
  if (!walletAddress || !tokenAddress) {
    throw new Error('Invalid wallet or token address');
  }

  const publicKey = new PublicKey(walletAddress);
  // For SOL
  if (tokenAddress === 'So11111111111111111111111111111111111111112') {
    // Fetch SOL balance
    const balanceLamports = await executeWithFallback(async (url) => {
      const conn = new Connection(url);
      return conn.getBalance(publicKey, 'confirmed');
    }, solanaRpcUrls);

    return { balance: balanceLamports, decimals: 9, symbol: 'SOL' };
  } else {
    // For SPL Tokens
    // balance should be in raw units (smallest units)
    const tokenAccounts = await executeWithFallback(async (url) => {
      const conn = new Connection(url);
      return conn.getParsedTokenAccountsByOwner(publicKey, {
        mint: new PublicKey(tokenAddress),
      }, 'confirmed');
    }, solanaRpcUrls);

    let balance = 0;
    const tokenMetadata = await getTokenMetadata([tokenAddress]);
    const { decimals, symbol } = tokenMetadata[tokenAddress];

    if (tokenAccounts.value.length > 0) {
      const tokenAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
      balance = Number(tokenAmount.amount);
      // Do not divide by decimals here
    }

    return { balance, decimals, symbol };
  }
}

//  Fetches the balance of a specific token for multiple wallets
export async function getBalancesForWallets(
  walletAddresses: string[],
  tokenAddress: string
): Promise<{ [walletAddress: string]: number }> {
  const balances: { [walletAddress: string]: number } = {};
  const limit = pLimit(8); // Limit to 8 concurrent requests

  await Promise.all(
    walletAddresses.map((walletAddress) =>
      limit(async () => {
        if (tokenAddress === 'So11111111111111111111111111111111111111112' || 'SOL') {
          // Fetch SOL balance
          const balanceLamports = await getBalance(walletAddress);
          balances[walletAddress] = balanceLamports / LAMPORTS_PER_SOL;
        } else {
          // Fetch SPL Token balance
          const { balance } = await getTokenBalance(walletAddress, tokenAddress);
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
  const limit = pLimit(5); // Limit to 5 concurrent requests

  await Promise.all(
    tokenAddresses.map((tokenAddress) =>
      limit(async () => {
        const { balance } = await getTokenBalance(walletAddress, tokenAddress);
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
  const limit = pLimit(5); // Limit to 5 concurrent requests
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

