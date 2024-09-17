import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import dbConnect from '../../lib/mongodb';
import User from '../../models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { encryptedSeed } = req.body;

  try {
    await dbConnect();
    if (session && session.user) {
      await User.findOneAndUpdate(
        { email: session.user.email },
        { $set: { encryptedSeed } },
        { upsert: true, new: true }
      );
      res.status(200).json({ message: 'Wallet saved successfully' });
    } else {
      res.status(400).json({ error: 'Invalid session data' });
    }
  } catch (error) {
    console.error('Failed to save wallet:', error);
    res.status(500).json({ error: 'Failed to save wallet' });
  }
}
