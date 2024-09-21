import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Channel {
  id: string;
  name: string;
}

export default function ChannelManager() {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  useEffect(() => {
    if (session && selectedWallet) {
      fetchChannels();
    }
  }, [session, selectedWallet]);

  const fetchChannels = async () => {
    const response = await fetch(`/api/get-channels?wallet=${selectedWallet}`);
    if (response.ok) {
      const data = await response.json();
      setChannels(data.channels);
    }
  };

  const connectChannel = async (channelId: string) => {
    const response = await fetch('/api/connect-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: selectedWallet, channelId }),
    });
    if (response.ok) {
      fetchChannels();
    }
  };

  return (
    <div>
      <h2>Channel Manager</h2>
      <select onChange={(e) => setSelectedWallet(e.target.value)}>
        {/* Populate with wallets */}
      </select>
      <ul>
        {channels.map((channel) => (
          <li key={channel.id}>
            {channel.name}
            <button onClick={() => connectChannel(channel.id)}>Connect</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
