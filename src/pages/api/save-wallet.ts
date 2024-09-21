import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
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

    const { publicKey, privateKey } = req.body;

    await connectDB();
    let encryptedPrivateKey;
    try {
      encryptedPrivateKey = encrypt(privateKey);
    } catch (encryptError) {
      console.error('Encryption error:', encryptError);
      return res.status(500).json({ error: `Failed to encrypt wallet: ${encryptError.message}` });
    }

    const user = await User.findOneAndUpdate(
      { discordId: session.user.id },
      { 
        $push: { 
          wallets: { publicKey, encryptedPrivateKey } 
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
    res.status(500).json({ error: `Failed to save wallet: ${error.message}` });
  }
}
