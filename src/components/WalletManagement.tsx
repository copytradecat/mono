import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

interface Wallet {
  publicKey: string;
  encryptedPrivateKey: string;
}

interface TokenBalance {
  mint: string;
  balance: number;
}

export default function WalletManagement() {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);

  useEffect(() => {
    if (session) {
      fetchWallets();
    }
  }, [session]);

  useEffect(() => {
    if (selectedWallet) {
      fetchTokenBalances(selectedWallet);
    }
  }, [selectedWallet]);

  const fetchWallets = async () => {
    const response = await fetch('/api/get-wallets');
    if (response.ok) {
      const data = await response.json();
      setWallets(data.wallets);
    } else {
      console.error('Failed to fetch wallets');
    }
  };

  const fetchTokenBalances = async (publicKey: string) => {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    const pubKey = new PublicKey(publicKey);

    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const balances = tokenAccounts.value.map((accountInfo) => ({
        mint: accountInfo.account.data.parsed.info.mint,
        balance: accountInfo.account.data.parsed.info.tokenAmount.uiAmount,
      }));

      setTokenBalances(balances);
    } catch (error) {
      console.error('Error fetching token balances:', error);
    }
  };

  const handleRemoveWallet = async (publicKey: string) => {
    if (confirm("Are you sure you want to remove this wallet? This action is irreversible. Please ensure you have backed up your wallet before proceeding.")) {
      try {
        const response = await fetch('/api/remove-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicKey }),
        });

        if (response.ok) {
          alert('Wallet removed successfully');
          fetchWallets();
        } else {
          alert('Failed to remove wallet. Please try again.');
        }
      } catch (error) {
        console.error('Error removing wallet:', error);
        alert('An error occurred while removing the wallet');
      }
    }
  };

  return (
    <div>
      <h1>Wallet Management</h1>
      <select onChange={(e) => setSelectedWallet(e.target.value)}>
        <option value="">Select a wallet</option>
        {wallets.map((wallet, index) => (
          <option key={index} value={wallet.publicKey}>
            {wallet.publicKey ? `${wallet.publicKey.slice(0, 10)}...${wallet.publicKey.slice(-10)}` : `Wallet ${index + 1}: No public key`}
          </option>
        ))}
      </select>

      {selectedWallet && (
        <div>
          <h2>Selected Wallet: {selectedWallet}</h2>
          <h3>Token Balances:</h3>
          <ul>
            {tokenBalances.map((token, index) => (
              <li key={index}>
                {token.mint}: {token.balance}
              </li>
            ))}
          </ul>
          <button onClick={() => handleRemoveWallet(selectedWallet)}>Remove Wallet</button>
        </div>
      )}

      <h3>Available Wallets:</h3>
      {wallets.map((wallet, index) => (
        <div key={index}>
          <p>Wallet {index + 1}: {wallet.publicKey || 'No public key'}</p>
          <button onClick={() => handleRemoveWallet(wallet.publicKey)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
