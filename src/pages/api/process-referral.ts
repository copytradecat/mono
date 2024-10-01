import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/authOptions';
import { connectDB } from '../../lib/mongodb';
import UserModel from '../../models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { referralCode } = req.body;
  
  if (!referralCode) {
    return res.status(400).json({ error: 'Referral code is required' });
  }

  try {
    await connectDB();

    const newUserDiscordId = session.user?.name;
    const newUser = await UserModel.findOne({ discordId: newUserDiscordId });

    // Ensure createdAt field exists
    if (!newUser?.createdAt) {
      return res.status(400).json({ error: 'User creation date not found' });
    }

    // Check if the user is new (e.g., created within the last 5 minutes)
    const isNewUser = (new Date().getTime() - newUser.createdAt.getTime()) < 5 * 60 * 1000; // 5-minute window

    if (isNewUser) {
      const referrer = await UserModel.findOneAndUpdate(
        { accountNumber: parseInt(referralCode, 10) },
        { $addToSet: { referrals: newUserDiscordId } }
      );

      if (!referrer) {
        return res.status(404).json({ error: 'Referrer not found' });
      }

      return res.status(200).json({ message: 'Referral processed successfully' });
    } else {
      return res.status(400).json({ error: 'User is not new or referral already processed' });
    }
  } catch (error) {
    console.error('Failed to process referral:', error);
    res.status(500).json({ error: 'Failed to process referral' });
  }
}