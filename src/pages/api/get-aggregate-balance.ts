import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';
import { getAggregateBalance } from '../../services/jupiter.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    await connectDB();
    const user = await User.findOne({ discordId: session.user.id });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const walletAddresses = user.wallets.map(wallet => wallet.publicKey);
    const aggregateBalance = await getAggregateBalance(walletAddresses);

    res.status(200).json({ aggregateBalance });
  } catch (error) {
    console.error('Failed to fetch aggregate balance:', error);
    res.status(500).json({ error: 'Failed to fetch aggregate balance' });
  }
}
