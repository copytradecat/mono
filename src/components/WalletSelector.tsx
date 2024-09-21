import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Wallet {
  publicKey: string;
}

export default function WalletSelector({ channelId, refreshTrigger }: { channelId: string | null, refreshTrigger: number }) {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session) {
      fetchWallets();
      const storedWallet = localStorage.getItem(`selectedWallet_${channelId}`);
      if (storedWallet) {
        setSelectedWallet(storedWallet);
      }
    }
  }, [session, refreshTrigger, channelId]);

  useEffect(() => {
    if (session && channelId && selectedWallet) {
      localStorage.setItem(`selectedWallet_${channelId}`, selectedWallet);
      connectWalletToChannel(selectedWallet, channelId);
    }
  }, [session, channelId, selectedWallet]);

  const fetchWallets = async () => {
    try {
      const response = await fetch('/api/get-wallets');
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched wallets (full object):', JSON.stringify(data.wallets, null, 2));
        setWallets(data.wallets);
      } else {
        const errorData = await response.json();
        console.error('Error fetching wallets:', errorData);
        setError(errorData.error);
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error);
      setError('Failed to fetch wallets. Please try again.');
    }
  };

  const connectWalletToChannel = async (walletAddress: string, channelId: string) => {
    try {
      const response = await fetch('/api/connect-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, channelId }),
      });

      if (response.ok) {
        console.log('Wallet connected successfully!');
      } else {
        console.error('Failed to connect wallet. Please try again.');
      }
    } catch (error) {
      console.error('Error connecting wallet to channel:', error);
    }
  };

  const handleWalletChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newWallet = e.target.value;
    setSelectedWallet(newWallet);
  };

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h2>Select a Wallet</h2>
      <select onChange={handleWalletChange} value={selectedWallet || ''}>
        <option value="">Select a wallet</option>
        {wallets.map((wallet, index) => (
          <option key={index} value={wallet.publicKey}>
            {wallet.publicKey ? `${wallet.publicKey.slice(0, 10)}...${wallet.publicKey.slice(-10)}` : `Wallet ${index + 1}: No public key`}
          </option>
        ))}
      </select>
      <div>
        <h3>Available Wallets:</h3>
        {wallets.map((wallet, index) => (
          <p key={index}>Wallet {index + 1}: {wallet.publicKey || 'No public key'}</p>
        ))}
      </div>
      {selectedWallet && (
        <div>
          <h3>Connected Wallet:</h3>
          <p>{selectedWallet}</p>
        </div>
      )}
    </div>
  );
}
