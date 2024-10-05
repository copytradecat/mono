import User from '../models/User';

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
  initiatingSelections: number[],
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