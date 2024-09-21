import { useSession } from "next-auth/react";
import SignInInterface from "../components/SignInInterface";
import AccountSettings from '../components/AccountSettings';
import WalletConnection from '../components/WalletConnection';

export default function Home() {
  const { data: session } = useSession();

  return (
    <div>
      <h1>CopyTradeCat</h1>
      <SignInInterface />
      {session && (
        <>
          <AccountSettings />
          <WalletConnection />
        </>
      )}
    </div>
  );
}