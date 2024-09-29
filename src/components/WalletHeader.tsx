import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useWallets } from '../hooks/useWallets';

export default function WalletHeader({ selectedWallet, setSelectedWallet }: { selectedWallet: string | null, setSelectedWallet: (wallet: string | null) => void }) {
  const { data: session } = useSession();
  const { wallets, isLoading, error } = useWallets();

  useEffect(() => {
    if (session && wallets.length > 0 && !selectedWallet) {
      setSelectedWallet(wallets[0].publicKey);
    }
  }, [session, wallets, selectedWallet, setSelectedWallet]);

  return (
    <div className="flex justify-between items-center p-4 bg-gray-100">
      <h1 className="text-xl font-bold">Wallet Management</h1>
      {session && (
        <div className="flex items-center">
          <select 
            value={selectedWallet || ''}
            onChange={(e) => setSelectedWallet(e.target.value)}
            className="mr-4 p-2 border rounded"
          >
            <option value="">Select a wallet</option>
            {wallets.map((wallet) => (
              <option key={wallet.publicKey} value={wallet.publicKey}>
                {wallet.publicKey.slice(0, 6)}...{wallet.publicKey.slice(-4)}
              </option>
            ))}
          </select>
          <Link href="/wallet-management" className="bg-blue-500 text-white px-4 py-2 rounded">
            Manage Wallets
          </Link>
        </div>
      )}
    </div>
  );
}