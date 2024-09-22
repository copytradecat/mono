import { Connection, PublicKey } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

export async function getTokenBalances(publicKey: string) {
  const jupiter = await Jupiter.load({
    connection,
    cluster: 'mainnet-beta',
    user: null,
  });

  const tokenAccounts = await jupiter.getTokenAccounts(new PublicKey(publicKey));
  const balances: { [key: string]: number } = {};

  for (const [mint, account] of Object.entries(tokenAccounts)) {
    const balance = account.balance / Math.pow(10, account.decimals);
    balances[mint] = balance;
  }

  return balances;
}

export async function getAggregateBalance(wallets: string[]) {
  const jupiter = await Jupiter.load({
    connection,
    cluster: 'mainnet-beta',
    user: null,
  });

  const aggregateBalance: { [key: string]: number } = {};

  for (const wallet of wallets) {
    const publicKey = new PublicKey(wallet);
    const solBalance = await connection.getBalance(publicKey);
    aggregateBalance['SOL'] = (aggregateBalance['SOL'] || 0) + solBalance / 1e9;

    const tokenAccounts = await jupiter.getTokenAccounts(publicKey);
    for (const [mint, account] of Object.entries(tokenAccounts)) {
      const balance = account.balance / Math.pow(10, account.decimals);
      aggregateBalance[mint] = (aggregateBalance[mint] || 0) + balance;
    }
  }

  return aggregateBalance;
}