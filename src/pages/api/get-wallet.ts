import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { connectDB } from '../../lib/mongodb';
import User from '../../models/User';
import { decrypt } from '../../lib/encryption';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { authOptions } from '../../lib/authOptions';

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
    const user = await User.findOne({ discordId: session?.user?.name });

    if (!user || !user.wallets) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const decryptedSeed = decrypt(user.wallets[0].encryptedSecretData);
    const keypair = Keypair.fromSecretKey(bs58.decode(decryptedSeed));

    res.status(200).json({
      wallet: {
        publicKey: keypair.publicKey.toBase58(),
      },
    });
  } catch (error) {
    console.error('Failed to retrieve wallet:', error);
    res.status(500).json({ error: 'Failed to retrieve wallet' });
  }
}
