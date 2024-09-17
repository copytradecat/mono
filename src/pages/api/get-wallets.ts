import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import clientPromise from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('copytradecat');
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ discordId: session.user.id });

    if (!user || !user.wallets) {
      return res.status(404).json({ error: 'No wallets found' });
    }

    res.status(200).json({
      wallets: user.wallets.map((wallet: any) => ({
        publicKey: wallet.publicAddress
      }))
    });
  } catch (error) {
    console.error('Failed to retrieve wallets:', error);
    res.status(500).json({ error: 'Failed to retrieve wallets' });
  }
}
