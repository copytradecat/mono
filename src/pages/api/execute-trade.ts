import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import Trade from '../../models/Trade';
import { connectDB } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicKey, txid, amount, token } = req.body;

  try {
    await connectDB();
    await Trade.create({
      user: session.user.id,
      publicKey,
      txid,
      amount,
      token,
    });
    res.status(200).json({ message: 'Trade recorded successfully' });
  } catch (error) {
    console.error('Failed to record trade:', error);
    res.status(500).json({ error: 'Failed to record trade' });
  }
}