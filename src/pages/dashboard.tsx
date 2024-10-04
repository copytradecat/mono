import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import WalletHeader from '../components/WalletHeader';
import WalletManager from '../components/WalletManager';
import ChannelManager from '../components/ChannelManager';
import TradingInterface from '../components/TradingInterface';
import BotSettings from '../components/BotSettings';
import { withSubscriptionCheck } from '../components/withSubscriptionCheck';
const Dashboard = withSubscriptionCheck(() => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  if (!session) {
    router.push('/');
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <WalletHeader selectedWallet={selectedWallet} setSelectedWallet={setSelectedWallet} />
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <WalletManager selectedWallet={selectedWallet} setSelectedWallet={setSelectedWallet} />
          {/* <ChannelManager selectedWallet={selectedWallet} /> */}
        </div>
        <div>
          {false &&selectedWallet && (
            <TradingInterface selectedWallet={selectedWallet} userId={session?.user?.name ?? ''} />
          )}
          <BotSettings walletPublicKey={selectedWallet} />
        </div>
      </div>
    </div>
  );
});

export default Dashboard;