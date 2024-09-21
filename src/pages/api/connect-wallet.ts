import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';
import dbConnect from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { walletAddress, channelId } = req.body;

  if (!walletAddress || !channelId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    await dbConnect();

    const user = await User.findOneAndUpdate(
      { discordId: session.user.id },
      { 
        $addToSet: { 
          wallets: { publicAddress: walletAddress },
          channels: channelId
        }
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ message: 'Wallet connected successfully', user });
  } catch (error) {
    console.error('Failed to connect wallet:', error);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
}