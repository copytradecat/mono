import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function NavMenu() {
  const { data: session } = useSession();

  return (
    <nav>
      <Link href="/">Home</Link>&nbsp;
      {session && (
        <>
          <Link href="/dashboard">Dashboard</Link>&nbsp;
          <Link href="/wallet-management">Wallet Management</Link>&nbsp;
          <button onClick={() => signOut()}>Log Out</button>
        </>
      )}
    </nav>
  );
}
