import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface BetaAccessRequestProps {
  onRequestSubmitted: () => void;
}

export default function BetaAccessRequest({ onRequestSubmitted }: BetaAccessRequestProps) {
  const { data: session } = useSession();
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState('');
  const [accountNumber, setAccountNumber] = useState<number | null>(null);
  const [subLevel, setSubLevel] = useState<number | null>(null);

  useEffect(() => {
    if (session) {
      fetchUserStatus();
    }
  }, [session]);

  const fetchUserStatus = async () => {
    const response = await fetch('/api/check-subscription');
    if (response.ok) {
      const data = await response.json();
      setAccountNumber(data.accountNumber);
      setSubLevel(data.level);
    }
  };

  const handleRequestAccess = async () => {
    if (!session) return;

    setIsRequesting(true);
    try {
      const response = await fetch('/api/request-beta-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: session.user?.name }),
      });

      if (response.ok) {
        const data = await response.json();
        setAccountNumber(data.accountNumber);
        setSubLevel(data.level);
        setRequestStatus(`Your beta access request has been submitted. You are #${data.accountNumber} in line.`);
        onRequestSubmitted();
      } else {
        const errorData = await response.json();
        setRequestStatus(`Failed to submit beta access request: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error requesting beta access:', error);
      setRequestStatus('An error occurred. Please try again later.');
    }
    setIsRequesting(false);
  };

  return (
    <div>
      <h2>Request Beta Access</h2>
      {subLevel === 1 && !requestStatus ? (
        <p>You have already requested beta access. </p>
      ) : requestStatus ? (
        <p>{requestStatus}</p>
      ) : (
        <button onClick={handleRequestAccess} disabled={isRequesting}>
          {isRequesting ? 'Requesting...' : 'Request Beta Access'}
        </button>
      )}
    </div>
  );
}