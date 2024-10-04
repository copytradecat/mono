import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import WalletSelector from '../components/WalletSelector';
import WalletImport from '../components/WalletImport';

export default function Connect() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    if (router.isReady) {
      setChannelId(router.query.channelId as string);
    }
  }, [router.isReady, router.query]);

  useEffect(() => {
    async function fetchChannels() {
      const response = await fetch('/api/get-channels');
      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels);
      }
    }
    fetchChannels();
  }, []);

  const handleWalletAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  if (!session) {
    return <div>Please sign in to connect your wallet.</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
      {channelId ? (
        <>
          <p className="mb-4">Channel ID: {channelId}</p>
          <WalletSelector channelId={channelId} refreshTrigger={refreshTrigger} />
          <WalletImport onWalletAdded={handleWalletAdded} channels={channels} />
        </>
      ) : (
        <p>No channel ID provided.</p>
      )}
    </div>
  );
}