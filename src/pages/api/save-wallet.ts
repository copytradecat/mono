import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';
import { encrypt } from '../../lib/encryption';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    console.log('Session:', JSON.stringify(session, null, 2));
    console.log('Session user:', JSON.stringify(session.user, null, 2));

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('Request body:', JSON.stringify(req.body, null, 2));
    const { publicKey, secretData, type } = req.body;

    console.log('Received wallet data:', { 
      publicKey, 
      type, 
      secretDataLength: secretData?.length,
      sessionUserId: session.user?.id,
      sessionUserEmail: session.user?.email
    });

    if (!publicKey || !secretData || !type) {
      return res.status(400).json({ error: 'Missing required fields', received: { publicKey: !!publicKey, secretData: !!secretData, type: !!type } });
    }

    if (typeof secretData !== 'string') {
      return res.status(400).json({ error: 'Secret data must be a string', received: typeof secretData });
    }

    await connectDB();
    const encryptedSecretData = encrypt(secretData);

    const normalizedPublicKey = publicKey;


    const existingUser = await User.findOne({ 
      discordId: session.user.id, 
      'wallets.publicKey': normalizedPublicKey 
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Wallet already exists' });
    }

    const user = await User.findOneAndUpdate(
      { discordId: session.user.id },
      {
        $push: {
          wallets: {
            publicKey: normalizedPublicKey,
            encryptedSecretData,
            secretType: type,
            connectedChannels: []
          }
        },
        $setOnInsert: {
          email: session.user.email,
          discordId: session.user.id
        }
      },
      { new: true, upsert: true }
    );

    console.log('User after update:', JSON.stringify(user, null, 2));

    if (!user) {
      throw new Error('User not found or not updated');
    }

    res.status(200).json({ message: 'Wallet saved successfully' });
  } catch (error) {
    console.error('Failed to save wallet:', error);
    res.status(500).json({ error: `Failed to save wallet: ${error.message}` });
  }
}
