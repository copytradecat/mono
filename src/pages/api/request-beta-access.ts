import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { connectDB } from '../../lib/mongodb';
import Subscription from '../../models/Subscriptions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const subscription = await Subscription.findOneAndUpdate(
      { userId: session.user.name },
      { $set: { betaRequested: true, level: 1, status: 'pending' } },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.status(200).json({ message: 'Beta access requested successfully' });
  } catch (error) {
    console.error('Failed to request beta access:', error);
    res.status(500).json({ error: 'Failed to request beta access' });
  }
}