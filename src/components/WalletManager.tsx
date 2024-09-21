import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenBalances } from '../services/jupiter.service';

interface Wallet {
  publicKey: string;
  encryptedPrivateKey: string;
  connectedChannels: string[];
}

export default function WalletManager() {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [balances, setBalances] = useState<any>({});

  useEffect(() => {
    if (session) {
      fetchWallets();
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
    }
  };

  const fetchBalances = async (publicKey: string) => {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    const solBalance = await connection.getBalance(new PublicKey(publicKey));
    const tokenBalances = await getTokenBalances(publicKey);
    setBalances({ SOL: solBalance / 1e9, ...tokenBalances });
  };

  return (
    <div>
      <h2>Wallet Manager</h2>
      <select onChange={(e) => setSelectedWallet(e.target.value)}>
        {wallets.map((wallet) => (
          <option key={wallet.publicKey} value={wallet.publicKey}>
            {wallet.publicKey}
          </option>
        ))}
      </select>
      {selectedWallet && (
        <div>
          <h3>Balances for {selectedWallet}</h3>
          {Object.entries(balances).map(([token, balance]) => (
            <p key={token}>{token}: {balance}</p>
          ))}
        </div>
      )}
    </div>
  );
}
