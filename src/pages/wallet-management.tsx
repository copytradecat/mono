import { useSession } from 'next-auth/react';
import WalletManagement from '../components/WalletManagement';
import { useRouter } from 'next/router';

export default function WalletManagementPage() {
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
    <div>
      <h1>Wallet Management</h1>
      <WalletManagement />
    </div>
  );
}
