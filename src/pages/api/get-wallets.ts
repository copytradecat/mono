import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { wallet } = req.query;

  try {
    await connectDB();
    const user = await User.findOne({ email: session.user.email });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const selectedWallet = user.wallets.find(w => w.publicKey === wallet);

    if (!selectedWallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.status(200).json({ channels: selectedWallet.connectedChannels });
  } catch (error) {
    console.error('Failed to fetch channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
}
