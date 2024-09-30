import { useSession } from "next-auth/react";
import SignInInterface from "../components/SignInInterface";
import BetaAccessRequest from "../components/BetaAccessRequest";
import BotInstructions from "./bot-instructions";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const { data: session } = useSession();
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    level: number;
    accountNumber: number | null;
    referralLink: string | null;
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
          {subscriptionInfo.level > 3 ? (
            <>
              <p>Welcome to CopyTradeCat! You have full access.</p>
              <Link href="/dashboard">Go to Dashboard</Link>
            </>
          ) : (
            <>
              {subscriptionInfo.level === 0 && (
                <BetaAccessRequest onRequestSubmitted={checkSubscription} />
              )}
              {subscriptionInfo.level === 1 && (
                <p>Your beta access request is pending.</p>
              )}
              {subscriptionInfo.level === 2 && (
                <>
                  <p>Welcome to the beta!</p>
                  <BotInstructions />
                </>
              )}
            </>
          )}
          {subscriptionInfo.referralLink && (
            <p>Your referral link: {subscriptionInfo.referralLink}</p>
          )}
        </>
      )}
    </div>
  );
}