import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';
import crypto from 'crypto';

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
    const user = await User.findOne({ name: session.user.name });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.referralCode) {
      return res.status(200).json({ referralCode: user.referralCode });
    }

    const referralCode = crypto.randomBytes(6).toString('hex');
    user.referralCode = referralCode;
    await user.save();

    res.status(200).json({ referralCode });
  } catch (error) {
    console.error('Failed to create referral code:', error);
    res.status(500).json({ error: 'Failed to create referral code' });
  }
}