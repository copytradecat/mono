// src/pages/api/check-subscription.ts
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

    if (!subscription) {
      return res.status(200).json({ 
        level: 0, 
        referralCode: null,
        accountNumber: user.accountNumber,
      });
    }

    const hasAccess = subscription.level > 0 && subscription.status === 'active';
    res.status(200).json({ 
      level: subscription.level, 
      referralCode: subscription.referralCode,
      accountNumber: user.accountNumber,
    });
  } catch (error) {
    console.error('Failed to check subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
}