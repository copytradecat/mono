import { useSession } from "next-auth/react";
import SignInInterface from "../components/SignInInterface";
import BetaAccessRequest from "../components/BetaAccessRequest";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const { data: session } = useSession();
  const [betaStatus, setBetaStatus] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (session) {
      checkBetaStatus();
      checkSubscription();
    }
  }, [session]);

  const checkBetaStatus = async () => {
    const response = await fetch('/api/check-beta-status');
    if (response.ok) {
      const data = await response.json();
      setBetaStatus(data.status);
    }
  };

  const checkSubscription = async () => {
    const response = await fetch('/api/check-subscription');
    if (response.ok) {
      const data = await response.json();
      setHasAccess(data.hasAccess);
    }
  };

  return (
    <div>
      <h1>CopyTradeCat</h1>
      <SignInInterface />
      {session && (
        <>
          {hasAccess ? (
            <>
              <p>Welcome to CopyTradeCat! You have full access.</p>
              <Link href="/dashboard">Go to Dashboard</Link>
            </>
          ) : (
            <>
              {betaStatus === 'active' && <p>Welcome to the beta!</p>}
              {betaStatus === 'pending' && <p>Your beta access request is pending.</p>}
              {betaStatus === 'inactive' && <BetaAccessRequest />}
            </>
          )}
        </>
      )}
    </div>
  );
}