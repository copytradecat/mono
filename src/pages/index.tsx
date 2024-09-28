import { useSession } from "next-auth/react";
import SignInInterface from "../components/SignInInterface";
import BetaAccessRequest from "../components/BetaAccessRequest";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const { data: session } = useSession();
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    hasAccess: boolean;
    level: number;
    betaRequested: boolean;
    referralCode: string | null;
  } | null>(null);

  useEffect(() => {
    if (session) {
      checkSubscription();
    }
  }, [session]);

  const checkSubscription = async () => {
    const response = await fetch('/api/check-subscription');
    if (response.ok) {
      const data = await response.json();
      setSubscriptionInfo(data);
    }
  };

  return (
    <div>
      <h1>CopyTradeCat</h1>
      <SignInInterface />
      {session && subscriptionInfo && (
        <>
          {subscriptionInfo.hasAccess ? (
            <>
              <p>Welcome to CopyTradeCat! You have full access.</p>
              <Link href="/dashboard">Go to Dashboard</Link>
            </>
          ) : (
            <>
              {subscriptionInfo.level === 0 && !subscriptionInfo.betaRequested && (
                <BetaAccessRequest onRequestSubmitted={checkSubscription} />
              )}
              {subscriptionInfo.level === 0 && subscriptionInfo.betaRequested && (
                <p>Your beta access request is pending.</p>
              )}
              {subscriptionInfo.level === 1 && (
                <p>Welcome to the beta!</p>
              )}
            </>
          )}
          {subscriptionInfo.referralCode && (
            <p>Your referral URL: {`${process.env.NEXT_PUBLIC_WEBSITE_URL}?ref=${subscriptionInfo.referralCode}`}</p>
          )}
        </>
      )}
    </div>
  );
}