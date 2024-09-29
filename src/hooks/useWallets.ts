// src/hooks/useWallets.ts

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface Wallet {
  publicKey: string;
  connectedChannels: string[];
}

export function useWallets() {
  const { data: session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/get-wallets');
      if (!response.ok) {
        throw new Error('Failed to fetch wallets');
      }
      const data = await response.json();
      setWallets(data.wallets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  return { wallets, isLoading, error, fetchWallets };
}