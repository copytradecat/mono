import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { connectDB } from '../../lib/mongodb';
import UserModel from '../../models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
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

    // Check if the user is new (you may need to adjust this logic based on your schema)
    const isNewUser = newUser?.createdAt && (new Date().getTime() - newUser.createdAt.getTime()) < 5 * 60 * 1000; // 5 minutes window

    if (isNewUser) {
      await UserModel.findOneAndUpdate(
        { accountNumber: parseInt(referralCode, 10) },
        { $addToSet: { referrals: newUserDiscordId } }
      );
      return res.status(200).json({ message: 'Referral processed successfully' });
    } else {
      return res.status(400).json({ error: 'User is not new or referral already processed' });
    }
  } catch (error) {
    console.error('Failed to process referral:', error);
    res.status(500).json({ error: 'Failed to process referral' });
  }
}