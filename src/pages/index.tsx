import { useSession, signIn, signOut } from "next-auth/react";
import WalletConnection from "../components/WalletConnection";

export default function Home() {
  const { data: session } = useSession();

  return (
    <div>
      <h1>CopyTradeCat</h1>
      {session ? (
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
      <WalletConnection />
    </div>
  );
}