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
    const referrerId = urlParams.get('r');
    if (referrerId) {
      // Store the referral code in localStorage
      localStorage.setItem('referrerId', referrerId);

      // Optionally, store it in a cookie if you prefer
      // setCookie(null, 'referrerId', referrerId, { path: '/' });
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
    const referrerId = localStorage.getItem('referrerId');

    if (referrerId) {
      try {
        const response = await axios.post('/api/process-referral', { referrerId });
        if (response.status === 200) {
          console.log('Referral processed successfully');
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          console.error('Failed to process referral:', error.response.data.error);
        } else {
          console.error('Failed to process referral:', error);
        }
      } finally {
        localStorage.removeItem('referrerId');
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
            <p>Your referral link: <Link href={referralLink} target="_blank" rel="noopener noreferrer" onClick={(e) => {
              e.preventDefault();
              navigator.clipboard.writeText(referralLink);
              alert('Referral link copied to clipboard');
            }}>{referralLink}</Link></p>
          )}
        </>
      )}
    </div>
  );
}