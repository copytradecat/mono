// src/components/withSubscriptionCheck.tsx
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

export function withSubscriptionCheck<P>(WrappedComponent: React.ComponentType<P>) {
  return function WithSubscriptionCheck(props: P) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [hasAccess, setHasAccess] = useState(false);

    useEffect(() => {
      async function checkAccess() {
        if (session) {
          const response = await fetch('/api/check-subscription');
          if (response.ok) {
            const data = await response.json();
            setHasAccess(data.level > 0);
          } else {
            setHasAccess(false);
          }
        }
      }

      checkAccess();
    }, [session]);

    if (status === 'loading') {
      return <div>Loading...</div>;
    }

    if (!session) {
      router.push('/');
      return null;
    }

    if (!hasAccess) {
      return (
        <div>
          <h1>Access Denied</h1>
          <p>You don't have access to this feature. Please upgrade your subscription.</p>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
}