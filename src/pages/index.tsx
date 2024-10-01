import { useSession } from "next-auth/react";
import SignInInterface from "../components/SignInInterface";
import BetaAccessRequest from "../components/BetaAccessRequest";
import BotInstructions from "../components/BotInstructions";
import { useEffect, useState } from "react";
import Link from "next/link";
import axios from 'axios';

export default function Home() {
  const { data: session, status } = useSession();
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    level: number;
    accountNumber: number | null;
  } | null>(null);

  useEffect(() => {
    if (session) {
      checkSubscription();
    }
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('r');
    if (referralCode) {
      // Store the referral code in localStorage
      localStorage.setItem('referralCode', referralCode);

      // Optionally, store it in a cookie if you prefer
      // setCookie(null, 'referralCode', referralCode, { path: '/' });
    }
  }, [session]);

  const checkSubscription = async () => {
    const response = await fetch('/api/check-subscription');
    if (response.ok) {
      const data = await response.json();
      setSubscriptionInfo(data);
    }
  };

  const referralLink = subscriptionInfo?.accountNumber
    ? `${process.env.NEXT_PUBLIC_WEBSITE_URL}?r=${subscriptionInfo.accountNumber}`
    : null;

  useEffect(() => {
    if (status === 'authenticated') {
      handleReferral();
    }
  }, [status]);

  const handleReferral = async () => {
    const referralCode = localStorage.getItem('referralCode');

    if (referralCode) {
      try {
        await axios.post('/api/process-referral', { referralCode });
        localStorage.removeItem('referralCode');
      } catch (error) {
        console.error('Failed to process referral:', error);
      }
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
          {referralLink && (
            <p>Your referral link: {referralLink}</p>
          )}
        </>
      )}
    </div>
  );
}