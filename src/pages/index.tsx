import { useSession, signIn, signOut, SessionProvider } from "next-auth/react";
import WalletConnection from "../components/WalletConnection";

export default function Home() {
  const { data: session } = useSession();

  return (
    <div>
      <h1>CopyTradeCat</h1>
      <SessionProvider session={session}>
        {session && session.user ? (
          <>
          Signed in as {session.user.email} <br />
          <button onClick={() => signOut()}>Sign out</button>
        </>
      ) : (
        <>
          Not signed in <br />
          <button onClick={() => signIn()}>Sign in</button>
        </>
      )}
      </SessionProvider>
      <WalletConnection />
    </div>
  );
}