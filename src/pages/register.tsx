import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import WalletSelector from '../components/WalletSelector';
import WalletImport from '../components/WalletImport';

export default function Register() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (router.isReady) {
      setChannelId(router.query.channelId as string);
    }
  }, [router.isReady, router.query]);

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
    <div>
      <h1>Connect Your Wallet</h1>
      <p>Channel ID: {channelId}</p>
      <WalletSelector channelId={channelId} refreshTrigger={refreshTrigger} />
      <WalletImport onWalletAdded={handleWalletAdded} />
    </div>
  );
}