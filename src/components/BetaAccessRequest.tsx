import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface BetaAccessRequestProps {
  onRequestSubmitted: () => void;
}

export default function BetaAccessRequest({ onRequestSubmitted }: BetaAccessRequestProps) {
  const { data: session } = useSession();
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState('');

  const handleRequestAccess = async () => {
    if (!session) return;

    setIsRequesting(true);
    try {
      const response = await fetch('/api/request-beta-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.name }),
      });

      if (response.ok) {
        setRequestStatus('Your beta access request has been submitted.');
        onRequestSubmitted();
      } else {
        setRequestStatus('Failed to submit beta access request. Please try again.');
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
      {requestStatus ? (
        <p>{requestStatus}</p>
      ) : (
        <button onClick={handleRequestAccess} disabled={isRequesting}>
          {isRequesting ? 'Requesting...' : 'Request Beta Access'}
        </button>
      )}
    </div>
  );
}