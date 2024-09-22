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
  }, [session]);

  const fetchWallets = async () => {
    const response = await fetch('/api/get-wallets');
    if (response.ok) {
      const data = await response.json();
      setWallets(data.wallets);
      fetchBalances(data.wallets);
    }
  };

  const fetchBalances = async (pubKey: string) => {
    try {
      const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
      const solBalance = await rateLimitedRequest(() => connection.getBalance(new PublicKey(pubKey)));
      const tokenBalances = await getTokenBalances(pubKey);
      setBalances({ SOL: solBalance / LAMPORTS_PER_SOL, ...tokenBalances });
    } catch (error) {
      console.error('Error fetching balances:', error);
      setBalances({ error: 'Failed to fetch balances' });
    }
  };

  return (
    <div>
      <h2>Your Wallet Information</h2>
      {wallets.map((wallet) => (
        <div key={wallet.publicKey}>
          <h3>Wallet: {wallet.publicKey}</h3>
          <p>SOL Balance: {balances[wallet.publicKey]?.SOL || 'Loading...'} SOL</p>
          <h4>Token Balances:</h4>
          <ul>
            {Object.entries(balances[wallet.publicKey] || {}).map(([token, balance]) => (
              token !== 'SOL' && <li key={token}>{token}: {balance}</li>
            ))}
          </ul>
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
