import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import WalletImport from './WalletImport';
import { useWallets } from '../hooks/useWallets';
import axios from 'axios';
import pLimit from 'p-limit';
import { getTokenBalances } from '../services/jupiter.service';
import BotSettings from './BotSettings';

interface TokenBalance {
  mint: string;
  balance: number;
}

export default function WalletManagement() {
  const { data: session } = useSession();
  const { wallets, isLoading, error, fetchWallets } = useWallets();
  const [showSettingsManager, setShowSettingsManager] = useState(false);
  const [selectedWalletForSettings, setSelectedWalletForSettings] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);


  useEffect(() => {
    if (session) {
      fetchWallets();
    }
  }, [session, fetchWallets, refreshTrigger]);

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

  const handleConnectChannel = async (event: React.FormEvent<HTMLFormElement>, publicKey: string) => {
    event.preventDefault();
    const channelId = (event.currentTarget.elements.namedItem('channelId') as HTMLInputElement).value;
    try {
      const response = await fetch('/api/connect-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey, channelId }),
      });

      if (response.ok) {
        console.log('Channel connected successfully');
        fetchWallets();
      } else {
        alert('Failed to connect channel. Please try again.');
      }
    } catch (error) {
      console.error('Error connecting channel:', error);
      alert('An error occurred while connecting the channel');
    }
  };

  const handleDisconnectChannel = async (publicKey: string) => {
    try {
      const response = await fetch('/api/disconnect-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey }),
      });

      if (response.ok) {
        console.log('Channel disconnected successfully');
        fetchWallets();
      } else {
        alert('Failed to disconnect channel. Please try again.');
      }
    } catch (error) {
      console.error('Error disconnecting channel:', error);
      alert('An error occurred while disconnecting the channel');
    }
  };

  const handleOpenSettingsManager = (walletPublicKey: string) => {
    setSelectedWalletForSettings(walletPublicKey);
    setShowSettingsManager(true);
  };

  const handleWalletAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Wallet Management</h1>
      <WalletImport onWalletAdded={handleWalletAdded} />

      <h3 className="text-xl font-semibold mb-4">Available Wallets:</h3>
      {wallets.map((wallet, index) => (
        <div key={index} className="mb-4 p-4 border rounded">
          <h3>Wallet {index + 1}</h3>
          <p>{wallet.publicKey || 'No public key'}&nbsp;
          <button onClick={() => handleRemoveWallet(wallet.publicKey)} className="bg-red-500 text-white px-2 py-1 rounded text-sm mt-2">Remove</button></p>
          {wallet.connectedChannels[0] && `Connected Channel: ${wallet.connectedChannels[0]}`}
          {wallet.connectedChannels[0] ? (
            <>
            &nbsp;<button onClick={() => handleDisconnectChannel(wallet.publicKey)} className="bg-red-500 text-white px-2 py-1 rounded text-sm mr-2">
              Disconnect Channel
            </button>
            </>
          ) : (
            <form onSubmit={(e) => handleConnectChannel(e, wallet.publicKey)} className="mt-2">
              <input type="text" name="channelId" placeholder="Enter Channel ID" className="mr-2 p-1 border rounded" />
              <button type="submit" className="bg-green-500 text-white px-2 py-1 rounded text-sm">Connect Channel</button>
            </form>
          )}
          <div className="mt-2">
            <button
              onClick={() => handleOpenSettingsManager(wallet.publicKey)}
              className="bg-blue-500 text-white px-2 py-1 rounded text-sm"
            >
              Wallet Settings
            </button>
          </div>
        </div>
      ))}

      {showSettingsManager && selectedWalletForSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded">
            <BotSettings walletPublicKey={selectedWalletForSettings} />
            <button
              onClick={() => setShowSettingsManager(false)}
              className="bg-red-500 text-white px-4 py-2 rounded mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}