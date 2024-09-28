import { useSession } from "next-auth/react";
import SignInInterface from "../components/SignInInterface";
import BetaAccessRequest from "../components/BetaAccessRequest";
import { useEffect, useState } from "react";

export default function Home() {
  const { data: session } = useSession();
  const [betaStatus, setBetaStatus] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      checkBetaStatus();
    }
  }, [session]);

  const checkBetaStatus = async () => {
    const response = await fetch('/api/check-beta-status');
    if (response.ok) {
      const data = await response.json();
      setBetaStatus(data.status);
    }
  };

  return (
    <div>
      <h1>CopyTradeCat</h1>
      <SignInInterface />
      {session && (
        <>
          {betaStatus === 'active' && <p>Welcome to the beta!</p>}
          {betaStatus === 'pending' && <p>Your beta access request is pending.</p>}
          {betaStatus === 'inactive' && <BetaAccessRequest />}
        </>
      )}
    </div>
  );
}