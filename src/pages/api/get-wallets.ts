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

  try {
    await connectDB();
    const user = await User.findOne({ email: session.user.email });

    if (!user || !user.wallets || user.wallets.length === 0) {
      return res.status(404).json({ error: 'No wallets found' });
    }

    res.status(200).json({
      wallets: user.wallets.map((wallet: any) => ({
        publicKey: wallet.publicKey || wallet.publicAddress,
        // Include any other relevant fields here
      }))
    });
  } catch (error) {
    console.error('Failed to retrieve wallets:', error);
    res.status(500).json({ error: 'Failed to retrieve wallets' });
  }
}
