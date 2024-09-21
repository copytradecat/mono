import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Wallet {
  publicKey: string;
}

export default function WalletSelector({ channelId, refreshTrigger }: { channelId: string | null, refreshTrigger: number }) {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      fetchWallets();
    }
  }, [session, refreshTrigger]);

  const fetchWallets = async () => {
    const response = await fetch('/api/get-wallets');
    if (response.ok) {
      const data = await response.json();
      setWallets(data.wallets);
    }
  };

  const handleConnect = async () => {
    if (!selectedWallet || !channelId) return;

    const response = await fetch('/api/connect-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: selectedWallet, channelId }),
    });

    if (response.ok) {
      alert('Wallet connected successfully!');
    } else {
      alert('Failed to connect wallet. Please try again.');
    }
  };

  return (
    <div>
      <h2>Select a Wallet</h2>
      <select onChange={(e) => setSelectedWallet(e.target.value)}>
        <option value="">Select a wallet</option>
        {wallets.map((wallet, index) => (
          <option key={index} value={wallet.publicAddress}>
            {wallet.publicAddress}
          </option>
        ))}
      </select>
      <button onClick={handleConnect} disabled={!selectedWallet}>
        Connect Wallet
      </button>
    </div>
  );
}
