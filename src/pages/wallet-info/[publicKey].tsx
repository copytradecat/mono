import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenBalances } from '../../services/jupiter.service';

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
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    const solBalance = await connection.getBalance(new PublicKey(pubKey));
    const tokenBalances = await getTokenBalances(pubKey);
    setBalances({ SOL: solBalance / 1e9, ...tokenBalances });
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