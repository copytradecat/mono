import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicKey, channelId, settings } = req.body;

  if (!publicKey || !channelId || !settings) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    await connectDB();

    const user = await User.findOneAndUpdate(
      { 
        discordId: session.user?.name, 
        'wallets.publicKey': publicKey,
        'wallets.connectedChannels': channelId
      },
      { 
        $set: { 
          'wallets.$.settings': settings
        }
      },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found or wallet not updated');
    }

    res.status(200).json({ message: 'Channel settings updated successfully', user });
  } catch (error) {
    console.error('Failed to update channel settings:', error);
    res.status(500).json({ error: 'Failed to update channel settings' });
  }
}
