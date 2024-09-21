import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function NavMenu() {
  const { data: session } = useSession();

  return (
    <nav>
      <Link href="/">Home</Link>
      {session && (
        <>
          <Link href="/wallet-management">Wallet Management</Link>
          <button onClick={() => signOut()}>Log Out</button>
        </>
      )}
    </nav>
  );
}
