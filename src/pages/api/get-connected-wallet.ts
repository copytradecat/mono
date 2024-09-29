import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { connectDB } from '../../lib/mongodb';
import User from '../../models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { channelId } = req.query;

  if (!channelId) {
    return res.status(400).json({ error: 'Missing channelId' });
  }

  try {
    await connectDB();
    const user = await User.findOne({ discordId: session.user?.name });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const connectedWallet = user.connectedWallets.find(
      (wallet: any) => wallet.channelId === channelId
    );

    if (!connectedWallet) {
      return res.status(404).json({ error: 'No connected wallet found for this channel' });
    }

    res.status(200).json({ walletAddress: connectedWallet.walletAddress });
  } catch (error) {
    console.error('Failed to retrieve connected wallet:', error);
    res.status(500).json({ error: 'Failed to retrieve connected wallet' });
  }
}
