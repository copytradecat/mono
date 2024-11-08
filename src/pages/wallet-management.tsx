import { useSession } from 'next-auth/react';
import WalletManagement from '../components/WalletManagement';
import { useRouter } from 'next/router';
import { withSubscriptionCheck } from '../components/withSubscriptionCheck';

const WalletManagementPage = withSubscriptionCheck(() => {
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
      <WalletManagement />
    </div>
  );
});

export default WalletManagementPage;
