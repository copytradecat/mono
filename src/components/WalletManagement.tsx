import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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

  return (
    <div>
      <h1>Wallet Management</h1>
      <select onChange={(e) => setSelectedWallet(e.target.value)}>
        <option value="">Select a wallet</option>
        {wallets.map((wallet, index) => (
          <option key={index} value={wallet.publicKey}>
            {wallet.publicKey.slice(0, 10)}...{wallet.publicKey.slice(-10)}
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
        </div>
      )}
    </div>
  );
}
