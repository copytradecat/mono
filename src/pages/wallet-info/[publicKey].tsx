import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getTokenBalances, rateLimitedRequest } from '../../services/jupiter.service';
import pLimit from 'p-limit';

export default function WalletInfo() {
  const router = useRouter();
  const { publicKey } = router.query;
  const [balances, setBalances] = useState<any>({});

  useEffect(() => {
    if (publicKey && typeof publicKey === 'string') {
      fetchBalances(publicKey);
    }
  }, [publicKey]);

  const fetchBalances = async (pubKey: string) => {
    const limit = pLimit(10); // Limit to 10 concurrent requests

    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    const solBalancePromise = rateLimitedRequest(() =>
      connection.getBalance(new PublicKey(pubKey))
    );

    const tokenAccountsResponse = await rateLimitedRequest(() =>
      connection.getParsedTokenAccountsByOwner(new PublicKey(pubKey), { programId: TOKEN_PROGRAM_ID })
    );

    const tokenAccounts = tokenAccountsResponse.value;

    const tokenBalancesPromises = tokenAccounts.map((accountInfo) =>
      limit(async () => {
        const mintAddress = accountInfo.account.data.parsed.info.mint;
        // Fetch token balance and metadata if needed
      })
    );

    // Rest of your code
  };

  if (!publicKey) return <div>Loading...</div>;

  return (
    <div>
      <h1>Wallet Info for {publicKey}</h1>
      <h2>Balances:</h2>
      {Object.entries(balances).map(([token, balance]) => (
        <p key={token}>{token}: {balance as React.ReactNode}</p>
      ))}
    </div>
  );
}
