import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useWallets } from '../hooks/useWallets';

interface Wallet {
  publicKey: string;
  connectedChannels: string[];
}

export default function WalletSelector({ channelId, refreshTrigger }: { channelId: string | null, refreshTrigger: number }) {
  const { data: session } = useSession();
  const { wallets, isLoading, error, fetchWallets } = useWallets();
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [alreadyConnected, setAlreadyConnected] = useState(false);

  const handleWalletChange = (publicKey: string) => {
    setSelectedWallet(publicKey);
    const alreadyConnectedWallet = wallets.find(wallet => wallet.publicKey === publicKey)?.connectedChannels
    if (alreadyConnectedWallet && alreadyConnectedWallet.length > 0 && !alreadyConnectedWallet.includes(channelId!)) {
      setAlreadyConnected(true);
    } else {
      setAlreadyConnected(false);
    }
  };

  const handleSave = async () => {
    if (!selectedWallet) return;

    try {
      const connectedWallet = wallets.find(wallet => wallet.connectedChannels.includes(channelId!));
      if(connectedWallet){
        await handleDisconnect(connectedWallet.publicKey);
      }
      
      const response = await fetch('/api/connect-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: selectedWallet, channelId }),
      });

      if (response.ok) {
        console.log('Wallet connected successfully!');
        fetchWallets();
      } else {
        console.error('Failed to connect wallet. Please try again.');
      }
    } catch (error) {
      console.error('Error connecting wallet to channel:', error);
    }
  };

  const handleDisconnect = async (publicKey: string) => {
    try {
      if (!channelId) {
        console.error('Channel ID is null. Cannot disconnect wallet.');
        return;
      }

      const response = await fetch('/api/disconnect-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey, channelId }),
      });

      if (response.ok) {
        console.log('Wallet disconnected successfully!');
        fetchWallets();
      } else {
        console.error('Failed to disconnect wallet. Please try again.');
      }
    } catch (error) {
      console.error('Error disconnecting wallet from channel:', error);
    }
  };

  if (isLoading) return <div>Loading wallets...</div>;
  if (error) return <div>Error loading wallets: {error}</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Select a wallet to connect to this channel</h2>
      <table>
        <thead>
          <tr>
            <th>Select</th>
            <th>Public Key</th>
            <th>Connected Channel</th>
            <th>Action</th>
          </tr>
        </thead>
      {wallets.map((wallet: Wallet) => (
        <tr key={wallet.publicKey}>
          <td>
            <input
              type="radio"
              name="wallet"
              value={wallet.publicKey}
              checked={selectedWallet ? selectedWallet === wallet.publicKey : wallet.connectedChannels.includes(channelId!)}
              onChange={() => handleWalletChange(wallet.publicKey)}
              // disabled={wallet.connectedChannels.length > 0 && !wallet.connectedChannels.includes(channelId!)}
              className="mr-2"
            />
          </td>
          <td>{wallet.publicKey}</td>
          <td>{wallet.connectedChannels.join(', ')}</td>
          <td>
            <button
              onClick={() => handleDisconnect(wallet.publicKey)}
              className="mt-2 bg-red-500 text-white px-4 py-2 rounded"
            >
              Disconnect channels
            </button>
          </td>
        </tr>
      ))}
      </table>

      {alreadyConnected && (
        <div className="mt-4 text-red-500">
          Selected wallet is already connected to another channel.
          Are you sure you want to disconnect it from that channel and connect it to this channel?
        </div>
      )}
      <button
        onClick={handleSave}
        disabled={!selectedWallet}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        Set Wallet Connection
      </button>
    </div>
  );
}