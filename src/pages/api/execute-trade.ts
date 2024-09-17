import { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getSession } from 'next-auth/react';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { publicKey, signedTransaction } = req.body;

  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL!);
    const txid = await connection.sendRawTransaction(signedTransaction);
    
    // Store trade information in database
    // Implement database logic here

    res.status(200).json({ txid });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute trade' });
  }
}