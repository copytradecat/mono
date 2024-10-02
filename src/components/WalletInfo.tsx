import { useCallback, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getTokenBalances } from '../services/jupiter.service';
import { useWallets } from '../hooks/useWallets';

export default function WalletInfo() {
  const { data: session } = useSession();
  const { wallets, isLoading, error } = useWallets(); 
  const [balances, setBalances] = useState<{ [key: string]: any }>({});

  const fetchBalances = useCallback(async (wallets: any[]) => {
    const balancesPromises = wallets.map(async (wallet: any) => {
      try {
        const { balances, metadata } = await getTokenBalances(wallet.publicKey);
        return { publicKey: wallet.publicKey, balances, metadata };
      } catch (error) {
        console.error(`Error fetching balances for wallet ${wallet.publicKey}:`, error);
        return { publicKey: wallet.publicKey, error: 'Failed to fetch balances' };
      }
    });

    const results = await Promise.all(balancesPromises);
    setBalances(results.reduce((acc, result) => {
      acc[result.publicKey] = result;
      return acc;
    }, {} as { [key: string]: any }));
  }, []);

  useEffect(() => {
    if (session && wallets.length > 0) {
      fetchBalances(wallets);
    }
  }, [session, wallets, fetchBalances]);

  return (
    <div>
      <h2>Your Wallet Information</h2>
      {wallets.map((wallet) => (
        <div key={wallet.publicKey}>
          <h3>Wallet: {wallet.publicKey}</h3>
          {balances[wallet.publicKey]?.error ? (
            <p>Error: {balances[wallet.publicKey].error}</p>
          ) : (
            <>
              <p>SOL Balance: {balances[wallet.publicKey]?.balances?.SOL?.toFixed(4) || 'Loading...'} SOL</p>
              <h4>Token Balances:</h4>
              <ul>
                {Object.entries(balances[wallet.publicKey]?.balances || {}).map(([token, balance]) => (
                  token !== 'SOL' && (
                    <li key={token}>
                      {balances[wallet.publicKey]?.metadata?.[token]?.symbol || token}: {(Number(balance) / Math.pow(10, balances[wallet.publicKey]?.metadata?.[token]?.decimals || 0)).toFixed(4)}
                    </li>
                  )
                ))}
              </ul>
            </>
          )}
          <h4>Connected Channels:</h4>
          <ul>
            {wallet.connectedChannels.map((channel) => (
              <li key={channel}>{channel}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}