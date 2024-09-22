import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import WalletManager from '../components/WalletManager';
import ChannelManager from '../components/ChannelManager';
import TradingInterface from '../components/TradingInterface';
import BotSettings from '../components/BotSettings';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  if (!session) {
    router.push('/');
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <WalletManager />
          <ChannelManager />
        </div>
        <div>
          <TradingInterface />
          <BotSettings />
        </div>
      </div>
    </div>
  );
}