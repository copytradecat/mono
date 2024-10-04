import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { presetId } = req.body;

  try {
    await connectDB();
    const user = await User.findOneAndUpdate(
      { discordId: session.user?.name },
      { $set: { primaryPresetId: presetId } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Primary preset set successfully' });
  } catch (error) {
    console.error('Error setting primary preset:', error);
    res.status(500).json({ error: 'Failed to set primary preset' });
  }
}