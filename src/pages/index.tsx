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
  const [betaPassword, setBetaPassword] = useState('');
  const [betaAccessError, setBetaAccessError] = useState('');

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

  const handleBetaAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/request-beta-access', { password: betaPassword });
      if (response.status === 200) {
        await checkSubscription();
        setBetaAccessError('');
        if (response.data.level === 2) {
          alert('Beta access granted! You now have full access to the beta.');
        } else {
          alert('Beta access requested successfully. Your request is pending approval.');
        }
      }
    } catch (error) {
      setBetaAccessError('Failed to process beta access request');
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
              {subscriptionInfo.level < 2 && (
                <>
                  <form onSubmit={handleBetaAccess}>
                    <input
                      type="password"
                      value={betaPassword}
                      onChange={(e) => setBetaPassword(e.target.value)}
                      placeholder="Enter beta access password"
                    />
                    <button type="submit">Submit</button>
                  </form>
                  {betaAccessError && <p style={{ color: 'red' }}>{betaAccessError}</p>}
                </>
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