import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { connectDB } from '../../lib/mongodb';
import Subscription from '../../models/Subscriptions';
import User from '../../models/User';

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
    const user = await User.findOne({ name: session.user?.name });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await Subscription.findOneAndUpdate(
      { userId: user.discordId },
      { $set: { betaRequested: true } },
      { new: true, upsert: true }
    );

    res.status(200).json({ 
      message: 'Beta access requested successfully',
      accountNumber: user.accountNumber,
      betaRequested: subscription.betaRequested
    });
  } catch (error) {
    console.error('Failed to request beta access:', error);
    res.status(500).json({ error: 'Failed to request beta access' });
  }
}