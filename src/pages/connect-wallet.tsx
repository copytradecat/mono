import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import WalletConnection from '../components/WalletConnection';

export default function ConnectWallet() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (router.isReady) {
      setChannelId(router.query.channelId as string);
    }
  }, [router.isReady, router.query]);

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
      <WalletConnection channelId={channelId} />
    </div>
  );
}
