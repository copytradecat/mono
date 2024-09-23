import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';

const SIGNING_SERVICE_URL = process.env.SIGNING_SERVICE_URL || 'http://localhost:3001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const { walletPublicKey, serializedTransaction } = req.body;
    const userId = session.user.id; // Adjust according to how you store the user ID

    try {
      const response = await axios.post(`${SIGNING_SERVICE_URL}/sign-and-send`, {
        userId,
        walletPublicKey,
        serializedTransaction,
      });

      res.status(200).json({ signature: response.data.signature });
    } catch (error) {
      console.error('Error signing and sending transaction:', error);
      res.status(500).json({ error: 'Failed to sign and send transaction' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
