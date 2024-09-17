import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import clientPromise from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { encryptedSeed, publicAddress } = req.body;

  try {
    const client = await clientPromise;
    const db = client.db('copytradecat');
    const usersCollection = db.collection('users');

    await usersCollection.updateOne(
      { discordId: session.user.id },
      { 
        $push: { 
          wallets: { encryptedSeed, publicAddress } 
        } 
      },
      { upsert: true }
    );

    res.status(200).json({ message: 'Wallet saved successfully' });
  } catch (error) {
    console.error('Failed to save wallet:', error);
    res.status(500).json({ error: 'Failed to save wallet' });
  }
}
