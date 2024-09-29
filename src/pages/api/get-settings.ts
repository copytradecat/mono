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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const user = await User.findOne({ discordId: session.user?.name });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(user.settings);
  } catch (error) {
    console.error('Failed to retrieve settings:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
}
