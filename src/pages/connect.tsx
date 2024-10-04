import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import WalletSelector from '../components/WalletSelector';
import WalletImport from '../components/WalletImport';

export default function Connect() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [inputChannelId, setInputChannelId] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (router.isReady) {
      const urlChannelId = router.query.channelId as string;
      if (urlChannelId) {
        setChannelId(urlChannelId);
        setInputChannelId(urlChannelId);
      }
    }
  }, [router.isReady, router.query]);

  const handleWalletAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleChannelIdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChannelId(inputChannelId);
  };

  const clearChannelId = () => {
    setChannelId(null);
    setInputChannelId('');
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
      {!channelId && (
        <form onSubmit={handleChannelIdSubmit} className="mb-4">
          <input
            type="text"
            value={inputChannelId}
            onChange={(e) => setInputChannelId(e.target.value)}
            placeholder="Enter Channel ID"
            className="border p-2 mr-2"
          />&nbsp;
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
            Set Channel ID
          </button>
        </form>
      )}
      {channelId ? (
        <>
          <p className="mb-4">Channel ID: {channelId}&nbsp;<button onClick={() => clearChannelId()}>clear</button></p>
          <WalletSelector channelId={channelId} refreshTrigger={refreshTrigger} />
          <WalletImport onWalletAdded={handleWalletAdded} />
        </>
      ) : (
        <p>Please enter a Channel ID to get started.</p>
      )}
    </div>
  );
}