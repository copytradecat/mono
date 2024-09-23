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
    const userId = session.user.id;
    const token = session.user.encodedToken;

    if (!userId || !token) {
      console.error('User ID or token is missing from the session');
      return res.status(400).json({ error: 'User ID or token is missing' });
    }

    try {
      console.log('Sending request to signing service with userId:', userId);
      const response = await axios.post(`${SIGNING_SERVICE_URL}/sign-and-send`, {
        userId,
        walletPublicKey,
        serializedTransaction,
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      res.status(200).json({ signature: response.data.signature });
    } catch (error) {
      console.error('Error signing and sending transaction:', error.response?.data || error.message);
      if (error.response?.status === 404) {
        res.status(404).json({ error: 'User or wallet not found' });
      } else {
        res.status(500).json({ error: 'Failed to sign and send transaction' });
      }
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}