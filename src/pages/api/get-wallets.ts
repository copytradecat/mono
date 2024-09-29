import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectDB();
    const session = await getServerSession(req, res, authOptions);

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findOne({ discordId: session.user.name }).select('wallets');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const simplifiedWallets = user.wallets.map(wallet => ({
      publicKey: wallet.publicKey,
      connectedChannels: wallet.connectedChannels || [],
    }));

    res.status(200).json({ wallets: simplifiedWallets });
  } catch (error) {
    console.error('Failed to fetch wallets:', error);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
}