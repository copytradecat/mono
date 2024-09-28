import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getTokenBalances } from '../services/jupiter.service';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

interface Wallet {
  publicKey: string;
  connectedChannels: string[];
}

export default function WalletInfo() {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [balances, setBalances] = useState<{ [key: string]: any }>({});

  useEffect(() => {
    if (session) {
      fetchWallets();
    }
  }, [session, fetchWallets]);

  const fetchWallets = async () => {
    const response = await fetch('/api/get-wallets');
    if (response.ok) {
      const data = await response.json();
      setWallets(data.wallets);
      fetchBalances(data.wallets);
    }
  };

  const fetchBalances = async (wallets: Wallet[]) => {
    const balancesPromises = wallets.map(async (wallet) => {
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
  };

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
                      {balances[wallet.publicKey]?.metadata?.[token]?.symbol || token}: {(balance / Math.pow(10, balances[wallet.publicKey]?.metadata?.[token]?.decimals || 0)).toFixed(4)}
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
