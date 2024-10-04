import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';
import { encrypt } from '../../lib/encryption';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { publicKey, secretData, type, channelId } = req.body;

    if (!publicKey || !secretData || !type) {
      return res.status(400).json({ error: 'Missing required fields', received: { publicKey: !!publicKey, secretData: !!secretData, type: !!type, channelId: !!channelId } });
    }

    if (typeof secretData !== 'string') {
      return res.status(400).json({ error: 'Secret data must be a string', received: typeof secretData });
    }

    await connectDB();
    const encryptedSecretData = encrypt(secretData);

    const normalizedPublicKey = publicKey;

    const existingUser = await User.findOne({ 
      discordId: session.user?.name, 
      'wallets.publicKey': normalizedPublicKey 
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Wallet already exists' });
    }

    const user = await User.findOneAndUpdate(
      { discordId: session.user?.name },
      {
        $set: {
          email: session.user?.email,
        },
        $push: {
          wallets: {
            publicKey: normalizedPublicKey,
            encryptedSecretData,
            secretType: type,
            connectedChannels: [channelId]
          }
        },
        $setOnInsert: {
          discordId: session.user?.name,
          name: session.user?.name,
        }
      },
      { new: true, upsert: true }
    );

    if (!user) {
      throw new Error('User not found or not updated');
    }

    res.status(200).json({ message: 'Wallet saved successfully' });
  } catch (error) {
    console.error('Failed to save wallet:', error);
    res.status(500).json({ error: `Failed to save wallet: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
}