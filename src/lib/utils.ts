import User from '../models/User';
import { Connection } from '@solana/web3.js';
import '../../env.ts';

export const solanaRpcUrls = [
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL_1,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL_2,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL_3,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL_4,
].filter(Boolean) as string[];

export const jupiterApiUrls = [
  process.env.NEXT_PUBLIC_JUPITER_API_URL_1,
  process.env.NEXT_PUBLIC_JUPITER_API_URL_2,
  process.env.NEXT_PUBLIC_JUPITER_API_URL_3,
].filter(Boolean) as string[];

export function getRandomSolanaRpcUrl(): string {
  return solanaRpcUrls[Math.floor(Math.random() * solanaRpcUrls.length)];
}

export function getRandomJupiterApiUrl(): string {
  return jupiterApiUrls[Math.floor(Math.random() * jupiterApiUrls.length)];
}

export async function getConnectedWalletsInChannel(channelId: string) {
  const users = await User.find({ 'wallets.connectedChannels': channelId });

  const connectedWallets = [];

  for (const user of users) {
    for (const wallet of user.wallets) {
      if (wallet.connectedChannels.includes(channelId)) {
        connectedWallets.push({ user, wallet });
      }
    }
  }

  return connectedWallets;
}

export function mapSelectionToUserSettings(
  userSelections: number[],
  selectedIndex: number
) {
  // Ensure the index exists in both arrays
  let index = selectedIndex;

  if (index >= userSelections.length) {
    // Fallback to the last index if user's array is shorter
    index = userSelections.length - 1;
  }

  return userSelections[index];
}

export const truncatedString = (longString: string, maxLength: number) => { 
    return longString.substring(0, maxLength) + '...' + longString.substring(longString.length - maxLength)
}

export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, initialDelay = 1000, factor = 2 }
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;

  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= factor;
    }
  }

  throw new Error('Max retries reached');
}

export function getRandomUrl(urls: string[]): string {
  return urls[Math.floor(Math.random() * urls.length)];
}

export async function executeWithFallback<T>(
  operation: (url: string) => Promise<T>,
  urls: string[],
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  const shuffledUrls = [...urls].sort(() => 0.5 - Math.random());

  for (let i = 0; i < maxRetries; i++) {
    for (const url of shuffledUrls) {
      try {
        return await operation(url);
      } catch (error) {
        console.error(`Error with URL ${url}:`, error);
        lastError = error as Error;
        // Continue to the next URL
      }
    }
    // If we've tried all URLs, wait before the next round of retries
    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
  }

  throw new Error(`All attempts failed. Last error: ${lastError?.message}`);
}

export async function getConnection(): Promise<Connection> {
  const shuffledUrls = solanaRpcUrls.sort(() => Math.random() - 0.5);
  for (const url of shuffledUrls) {
    try {
      const connection = new Connection(url, 'confirmed');
      await connection.getLatestBlockhash();
      return connection;
    } catch (error: any) {
      console.warn(`Failed to connect to RPC endpoint ${url}: ${error.message}`);
    }
  }
  throw new Error('All RPC endpoints failed.');
}

export function formatNumber(num: number, maxDecimals: number = 6): string {
  const fixed = num.toFixed(maxDecimals);
  return parseFloat(fixed).toString();
}

export async function checkRPCHealth(connection: Connection): Promise<boolean> {
  try {
    await connection.getLatestBlockhash();
    return true;
  } catch (error) {
    console.error('RPC health check failed:', error);
    return false;
  }
}
