import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface Channel {
  id: string;
  name: string;
}

export default function ChannelManager({ selectedWallet }: { selectedWallet: string | null }) {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [connectedChannels, setConnectedChannels] = useState<string[]>([]);

  const fetchChannels = useCallback(async () => {
    const response = await fetch('/api/get-channels');
    if (response.ok) {
      const data = await response.json();
      setChannels(data.channels);
    }
  }, []);

  const fetchConnectedChannels = useCallback(async () => {
    if (!selectedWallet) return;
    const response = await fetch(`/api/get-connected-channels?wallet=${selectedWallet}`);
    if (response.ok) {
      const data = await response.json();
      setConnectedChannels(data.connectedChannels);
    }
  }, [selectedWallet]);

  useEffect(() => {
    if (session && selectedWallet) {
      fetchChannels();
      fetchConnectedChannels();
    }
  }, [session, selectedWallet, fetchChannels, fetchConnectedChannels]);

  const connectChannel = async (channelId: string) => {
    const response = await fetch('/api/connect-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: selectedWallet, channelId }),
    });
    if (response.ok) {
      fetchConnectedChannels();
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">Channel Manager</h2>
      {selectedWallet ? (
        <div>
          <h3 className="text-xl font-semibold mb-2">Connected Channels:</h3>
          <ul className="mb-4">
            {connectedChannels.map((channelId) => (
              <li key={channelId}>{channelId}</li>
            ))}
          </ul>
          <h3 className="text-xl font-semibold mb-2">Available Channels:</h3>
          <ul>
            {channels.map((channel) => (
              <li key={channel.id} className="mb-2">
                {channel.name}
                {!connectedChannels.includes(channel.id) && (
                  <button
                    onClick={() => connectChannel(channel.id)}
                    className="ml-2 bg-blue-500 text-white px-2 py-1 rounded text-sm"
                  >
                    Connect
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Please select a wallet to manage channels.</p>
      )}
    </div>
  );
}
