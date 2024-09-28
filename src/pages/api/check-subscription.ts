// src/pages/api/check-subscription.ts
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const subscription = await Subscription.findOne({ userId: session.user.name });

    if (!subscription) {
      return res.status(200).json({ hasAccess: false, level: 0, betaRequested: false, referralCode: null });
    }

    const hasAccess = subscription.level > 0 && subscription.status === 'active';
    res.status(200).json({ 
      hasAccess, 
      level: subscription.level, 
      betaRequested: subscription.betaRequested,
      referralCode: subscription.referralCode
    });
  } catch (error) {
    console.error('Failed to check subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
}