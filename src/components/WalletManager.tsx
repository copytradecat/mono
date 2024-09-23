import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getTokenBalances } from '../services/jupiter.service';
import Link from 'next/link';
import axios from 'axios';

interface Wallet {
  publicKey: string;
  encryptedPrivateKey: string;
  connectedChannels: string[];
}

interface AggregateBalance {
  [key: string]: number;
}

export default function WalletManager({ selectedWallet, setSelectedWallet }: { selectedWallet: string | null, setSelectedWallet: (wallet: string | null) => void }) {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
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
    try {
      const response = await axios.get('/api/get-wallets');
      setWallets(response.data.wallets);
      if (response.data.wallets.length > 0 && !selectedWallet) {
        setSelectedWallet(response.data.wallets[0].publicKey);
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error);
    }
  };

  const fetchBalances = async (pubKey: string) => {
    try {
      const { balances, metadata } = await getTokenBalances(pubKey);
      console.log("balances: ", balances);
      console.log("metadata: ", metadata);
      setBalances(prevBalances => ({
        ...prevBalances,
        [pubKey]: { balances, metadata, error: null }
      }));
    } catch (error) {
      console.error('Error fetching balances:', error);
      setBalances(prevBalances => ({
        ...prevBalances,
        [pubKey]: { 
          balances: prevBalances[pubKey]?.balances || {}, 
          metadata: prevBalances[pubKey]?.metadata || {},
          error: 'Failed to fetch balances'
        }
      }));
    }
  };

  const fetchAggregateBalance = async () => {
    try {
      const response = await axios.get('/api/get-aggregate-balance');
      setAggregateBalance(response.data.aggregateBalance);
    } catch (error) {
      console.error('Failed to fetch aggregate balance:', error);
      setAggregateBalance({ error: 'Failed to fetch aggregate balance' });
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">Wallet Manager</h2>
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Aggregate Balance</h3>
        {aggregateBalance.error ? (
          <p className="text-red-500">{aggregateBalance.error}</p>
        ) : (
          Object.entries(aggregateBalance).map(([token, balance]) => (
            <p key={token} className="mb-1">{token}: {balance}</p>
          ))
        )}
      </div>
      {selectedWallet && (
        <div>
          <h3 className="text-xl font-semibold mb-2">Balances for {selectedWallet}</h3>
          {balances.error ? (
            <p className="text-red-500">{balances.error}</p>
          ) : (
            Object.entries(balances.balances || {}).map(([token, balance]) => (
              <p key={token} className="mb-1">
                {token === 'SOL' ? 'SOL' : balances.metadata[token]?.symbol || token}: {typeof balance === 'number' ? balance.toFixed(6) : balance} 
                {token === 'SOL' ? ' SOL' : ''}
              </p>
            ))
          )}
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
