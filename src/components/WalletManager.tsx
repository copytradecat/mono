import { useCallback, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getTokenBalances } from '../services/jupiter.service';
import Link from 'next/link';
import axios from 'axios';
import { useWallets } from '../hooks/useWallets';
import { debounce } from '../lib/limiter';
interface AggregateBalance {
  [key: string]: number;
}

export default function WalletManager({ selectedWallet, setSelectedWallet }: { selectedWallet: string | null, setSelectedWallet: (wallet: string | null) => void }) {
  const { data: session } = useSession();
  const { wallets, isLoading, error } = useWallets();
  const [balances, setBalances] = useState<any>({});
  const [aggregateBalance, setAggregateBalance] = useState<AggregateBalance>({});

  // const fetchAggregateBalance = useCallback(async () => {
  //   try {
  //     const response = await axios.get('/api/get-aggregate-balance');
  //     setAggregateBalance(response.data.aggregateBalance);
  //   } catch (error) {
  //     console.error('Failed to fetch aggregate balance:', error);
  //     setAggregateBalance({});
  //   }
  // }, []);

  // useEffect(() => {
  //   if (session) {
  //     fetchAggregateBalance();
  //   }
  // }, [session, fetchAggregateBalance]);

  useEffect(() => {
    if (selectedWallet) {
      debounce(fetchBalances(selectedWallet), 1000);
    }
  }, [selectedWallet]);

  const fetchBalances = async (pubKey: string) => {
    try {
      const { balances, metadata } = await getTokenBalances(pubKey);
      console.log("balances: ", balances);
      console.log("metadata: ", metadata);
      setBalances((prevBalances: any) => ({
        ...prevBalances,
        [pubKey]: { balances, metadata, error: null }
      }));
    } catch (error) {
      console.error('Error fetching balances:', error);
      setBalances((prevBalances: { [key: string]: { balances: any, metadata: any, error: string | null } }) => ({
        ...prevBalances,
        [pubKey]: {
          balances: prevBalances[pubKey]?.balances || {},
          metadata: prevBalances[pubKey]?.metadata || {},
          error: 'Failed to fetch balances'
        }
      }));
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
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
          <div className="mb-6">
            {aggregateBalance.error ? (
              <p className="text-red-500">{aggregateBalance.error}</p>
            ) : (
              Object.entries(aggregateBalance).map(([token, balance]) => (
                <p key={token} className="mb-1">{token}: {balance}</p>
              ))
            )}
          </div>
          <h3 className="text-xl font-semibold mt-4 mb-2">Connected Channels</h3>
          {(wallets.find(w => w.publicKey === selectedWallet)?.connectedChannels || []).map((channel, index) => (
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