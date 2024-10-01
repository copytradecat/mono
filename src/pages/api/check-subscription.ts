// src/pages/api/check-subscription.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import { connectDB } from '../../lib/mongodb';
import Subscription from '../../models/Subscriptions';
import User from '../../models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const user = await User.findOne({ discordId: session.user?.name });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await Subscription.findOne({ discordId: user.discordId });

    if (!subscription || subscription.subscriptions.length === 0) {
      return res.status(200).json({ 
        level: 0, 
        accountNumber: user.accountNumber,
      });
    }

    const activeSubscription = subscription.subscriptions
      .slice()
      .reverse()
      .find((sub: { status: string; endDate?: Date }) => 
        sub.status === 'active' && (!sub.endDate || sub.endDate > new Date())
      );

    res.status(200).json({ 
      level: activeSubscription ? activeSubscription.level : 0, 
      accountNumber: user.accountNumber,
    });
  } catch (error) {
    console.error('Failed to check subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
}