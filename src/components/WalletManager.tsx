import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenBalances } from '../services/jupiter.service';
import Link from 'next/link';

interface Wallet {
  publicKey: string;
  encryptedPrivateKey: string;
  connectedChannels: string[];
}

interface AggregateBalance {
  [key: string]: number;
}

export default function WalletManager() {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [balances, setBalances] = useState<any>({});
  const [aggregateBalance, setAggregateBalance] = useState<AggregateBalance>({});

  useEffect(() => {
    if (session) {
      fetchWallets();
      fetchAggregateBalance();
    }
  }, [session]);

  useEffect(() => {
    if (selectedWallet) {
      fetchBalances(selectedWallet);
    }
  }, [selectedWallet]);

  const fetchWallets = async () => {
    const response = await fetch('/api/get-wallets');
    if (response.ok) {
      const data = await response.json();
      setWallets(data.wallets);
      if (data.wallets.length > 0) {
        setSelectedWallet(data.wallets[0].publicKey);
      }
    } else {
      console.error('Failed to fetch wallets');
    }
  };

  const fetchBalances = async (publicKey: string) => {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    const solBalance = await connection.getBalance(new PublicKey(publicKey));
    const tokenBalances = await getTokenBalances(publicKey);
    setBalances({ SOL: solBalance / 1e9, ...tokenBalances });
  };

  const fetchAggregateBalance = async () => {
    const response = await fetch('/api/get-aggregate-balance');
    if (response.ok) {
      const data = await response.json();
      setAggregateBalance(data.aggregateBalance);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">Wallet Manager</h2>
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Aggregate Balance</h3>
        {Object.entries(aggregateBalance).map(([token, balance]) => (
          <p key={token} className="mb-1">{token}: {balance.toFixed(4)}</p>
        ))}
      </div>
      <select 
        onChange={(e) => setSelectedWallet(e.target.value)}
        className="w-full p-2 mb-4 border rounded"
      >
        {wallets.map((wallet) => (
          <option key={wallet.publicKey} value={wallet.publicKey}>
            {wallet.publicKey}
          </option>
        ))}
      </select>
      {selectedWallet && (
        <div>
          <h3 className="text-xl font-semibold mb-2">Balances for {selectedWallet}</h3>
          {Object.entries(balances).map(([token, balance]) => (
            <p key={token} className="mb-1">{token}: {balance}</p>
          ))}
          <h3 className="text-xl font-semibold mt-4 mb-2">Connected Channels</h3>
          {wallets.find(w => w.publicKey === selectedWallet)?.connectedChannels.map((channel, index) => (
            <p key={index} className="mb-1">{channel}</p>
          ))}
          <Link href={`/wallet-info/${selectedWallet}`} className="text-blue-500 hover:underline mt-4 inline-block">
            View Detailed Information
          </Link>
        </div>
      )}
    </div>
  );
}
