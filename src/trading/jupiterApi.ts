import { Connection, PublicKey, Transaction } from '@solana/web3.js';

export async function getQuote(inputToken: string, outputToken: string, amount: number): Promise<any> {
  const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
  quoteUrl.searchParams.append('inputMint', inputToken);
  quoteUrl.searchParams.append('outputMint', outputToken);
  quoteUrl.searchParams.append('amount', amount.toString());
  quoteUrl.searchParams.append('slippageBps', '50');

  const response = await fetch(quoteUrl.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get quote: ${await response.text()}`);
  }

  return response.json();
}

export async function getSwapTransaction(quoteResponse: any, userPublicKey: string): Promise<any> {
  const response = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapUnwrapSOL: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get swap transaction: ${await response.text()}`);
  }

  return response.json();
}

export async function executeSwap(connection: Connection, swapTransaction: string, signer: any): Promise<string> {
  const transaction = Transaction.from(Buffer.from(swapTransaction, 'base64'));
  return await connection.sendTransaction(transaction, [signer]);
}
