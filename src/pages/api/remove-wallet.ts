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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicKey } = req.body;

  if (!publicKey) {
    return res.status(400).json({ error: 'Missing publicKey' });
  }

  try {
    await connectDB();
    const user = await User.findOneAndUpdate(
      { discordId: session.user.id },
      { 
        $pull: { 
          wallets: { publicKey: publicKey }
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Wallet removed successfully' });
  } catch (error) {
    console.error('Failed to remove wallet:', error);
    res.status(500).json({ error: 'Failed to remove wallet' });
  }
}
