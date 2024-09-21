import { Connection, PublicKey } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

export async function getTokenBalances(walletAddress: string) {
  const jupiter = await Jupiter.load({
    connection,
    cluster: 'mainnet-beta',
    user: new PublicKey(walletAddress),
  });

  const tokenAccounts = await jupiter.getTokenAccounts();
  const balances: { [key: string]: number } = {};

  for (const [mint, account] of Object.entries(tokenAccounts)) {
    balances[mint] = account.balance / 10 ** account.decimals;
  }

  return balances;
}

export async function executeSwap(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippage: number,
  walletAddress: string
) {
  const jupiter = await Jupiter.load({
    connection,
    cluster: 'mainnet-beta',
    user: new PublicKey(walletAddress),
  });

  const routes = await jupiter.computeRoutes({
    inputMint: new PublicKey(inputMint),
    outputMint: new PublicKey(outputMint),
    amount,
    slippage,
    forceFetch: true,
  });

  const { execute } = await jupiter.exchange({
    routeInfo: routes.routesInfos[0],
  });

  const swapResult = await execute();

  if ('error' in swapResult) {
    throw new Error(swapResult.error);
  }

  return swapResult.txid;
}
