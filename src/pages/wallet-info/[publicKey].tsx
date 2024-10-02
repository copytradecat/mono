import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import pLimit from 'p-limit';
import { getBalance, getTokenBalances } from '../../services/jupiter.service';

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

    const solBalancePromise = await getBalance(pubKey);

    const tokenAccountsResponse = await getTokenBalances(pubKey);

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
