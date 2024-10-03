import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/authOptions";
import User from '../../../../models/User';
import { connectDB } from '../../../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicKey } = req.query;
  const { presetName } = req.body;

  try {
    await connectDB();
    const user = await User.findOne({ discordId: session.user?.name });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const preset = user.presets.find((p: any) => p.name === presetName);

    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    await User.updateOne(
      { discordId: session.user?.name, 'wallets.publicKey': publicKey },
      { 
        $set: { 
          'wallets.$.settings': preset.settings,
          'wallets.$.presetName': presetName
        } 
      }
    );

    res.status(200).json({ message: 'Preset applied successfully' });
  } catch (error) {
    console.error('Error applying preset:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}