import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/authOptions';
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

  const { referrerId } = req.body;
  
  if (!referrerId) {
    return res.status(400).json({ error: 'Referral code is required' });
  }

  try {
    await connectDB();

    const newUserDiscordId = session.user?.name;
    const newUser = await UserModel.findOne({ discordId: newUserDiscordId });

    if (!newUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if the user has already used a referral code
    if (newUser.referredBy) {
      return res.status(400).json({ error: 'You have already used a referral code' });
    }

    // Check if the referral code is valid
    const referrer = await UserModel.findOne({ accountNumber: parseInt(referrerId, 10) });
    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Update the new user with the referrer's information
    newUser.referredBy = referrer.discordId;
    await newUser.save();

    // Add the new user to the referrer's referrals
    await UserModel.findOneAndUpdate(
      { discordId: referrer.discordId },
      { $addToSet: { referrals: newUserDiscordId } }
    );

    return res.status(200).json({ message: 'Referral processed successfully' });
  } catch (error) {
    console.error('Failed to process referral:', error);
    res.status(500).json({ error: 'Failed to process referral' });
  }
}