import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { useWallets } from '../hooks/useWallets';
import axios from 'axios';
import pLimit from 'p-limit';
import { getTokenBalances } from '../services/jupiter.service';
import { PresetSchema, SettingsSchema, WalletSchema } from '../models/User';

interface TokenBalance {
  mint: string;
  balance: number;
}

export default function WalletManagement() {
  const { data: session } = useSession();
  const { wallets, isLoading, error, fetchWallets } = useWallets();
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [walletCreated, setWalletCreated] = useState(false);
  const [walletSeed, setWalletSeed] = useState('');
  const [publicAddress, setPublicAddress] = useState<string | null>(null);
  const [presets, setPresets] = useState<typeof PresetSchema[]>([]);

  const fetchTokenBalances = async (publicKey: string) => {
    const limit = pLimit(10); // Limit to 10 concurrent requests

    try {
      const tokenAccountsResponse = await getTokenBalances(publicKey);

      const { balances, metadata } = tokenAccountsResponse;

      const balancesPromises = Object.entries(balances).map(([mintAddress, balance]) =>
        limit(async () => {
          const tokenMetadata = metadata[mintAddress];
          const amount = parseFloat(balance.toString()) / Math.pow(10, tokenMetadata.decimals);

          return { mint: mintAddress, balance: amount };
        })
      );

      const fetchedBalances = await Promise.all(balancesPromises);

      setTokenBalances(fetchedBalances);
    } catch (error) {
      console.error('Error fetching token balances:', error);
      setTokenBalances([]);
    }
  };

  useEffect(() => {
    if (session) {
      fetchWallets();
      fetchPresets();
    }
  }, [session, fetchWallets]);

  useEffect(() => {
    if (selectedWallet) {
      fetchTokenBalances(selectedWallet);
    }
  }, [selectedWallet]);

  const handleCreateWallet = () => {
    const newKeypair = Keypair.generate();
    const seed = bs58.encode(newKeypair.secretKey);
    setWalletSeed(seed);
    setPublicAddress(newKeypair.publicKey.toBase58());
    setWalletCreated(true);
  };

  const handleSaveWallet = async () => {
    if (!session || !walletSeed) return;

    const response = await fetch('/api/save-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: publicAddress,
        secretData: walletSeed,
        type: 'seed',
      }),
    });

    if (response.ok) {
      alert('Wallet saved successfully!');
      fetchWallets();
    } else {
      const errorData = await response.json();
      alert(`Failed to save wallet: ${errorData.error}`);
    }
  };

  const handleImportWallet = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const seed = (event.currentTarget.elements.namedItem('seed') as HTMLInputElement).value;
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(seed));
      setWalletSeed(seed);
      setPublicAddress(keypair.publicKey.toBase58());
      setWalletCreated(true);
    } catch (error) {
      console.error('Invalid seed phrase');
      alert('Invalid seed phrase');
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

  const saveWallet = async (publicKey: string, secretData: string, type: 'seed' | 'privateKey') => {
    try {
      const response = await fetch('/api/save-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicKey, secretData, type }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save wallet');
      }

      const data = await response.json();
      console.log('Wallet saved successfully:', data);
      // Refresh the wallet list
      fetchWallets();
    } catch (error) {
      console.error('Error saving wallet:', error);
      // Handle the error (e.g., show an error message to the user)
    }
  };

  const fetchPresets = async () => {
    const response = await axios.get('/api/presets');
    setPresets(response.data);
  };

  const applyPresetToWallet = async (walletId: string, presetName: string) => {
    await axios.post(`/api/wallets/${walletId}/apply-preset`, { presetName });
    fetchWallets();
  };

  return (
    <div>
      <h1>Wallet Management</h1>
      <h3>Create or Import Wallet</h3>
      {!walletCreated && (
        <form onSubmit={handleImportWallet}>
          <input type="text" name="seed" placeholder="Enter seed phrase" />
          <button type="submit">Import Wallet</button>
        </form>
      )}
      {!walletCreated && <button onClick={handleCreateWallet}>Create New Wallet</button>}
      {walletCreated && (
        <div>
          <p>Public Address: {publicAddress?.toString()}</p>
          <button onClick={() => setShowPrivateKey(!showPrivateKey)}>
            {showPrivateKey ? 'Hide' : 'Reveal'} Private Key
          </button>
          {showPrivateKey && <p>Private Key: {walletSeed}</p>}
          <button onClick={handleSaveWallet}>Save Wallet</button>
        </div>
      )}

      <h3>Available Wallets:</h3>
      {wallets.map((wallet, index) => (
        <div key={index}>
          <p>Wallet {index + 1}: {wallet.publicKey || 'No public key'}</p>
          <button onClick={() => handleRemoveWallet(wallet.publicKey)}>Remove</button>
          <label htmlFor={`preset-select-${wallet.publicKey}`}>Apply Preset:</label>
          <select
            id={`preset-select-${wallet.publicKey}`}
            value={wallet.presetName || ''}
            onChange={(e) => applyPresetToWallet(wallet._id, e.target.value)}
          >
            <option value="">Select a preset</option>
            {presets.map((preset) => (
              <option key={preset._id} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}