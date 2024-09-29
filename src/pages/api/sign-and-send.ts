import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth/[...nextauth]';

const SIGNING_SERVICE_URL = process.env.SIGNING_SERVICE_URL || 'http://localhost:3001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Received request in sign-and-send API route');
  const session = await getServerSession(req, res, authOptions);
  console.log('Session:', JSON.stringify(session, null, 2));

  if (!session || !session.user) {
    console.log('Unauthorized: No session or user');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const { walletPublicKey, serializedTransaction } = req.body;
    const userId = session.user.name; // Should be the discordId

    // console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User ID:', userId);

    try {
      console.log('Sending request to signing service');
      const normalizedWalletPublicKey = walletPublicKey;
      const response = await axios.post(`${SIGNING_SERVICE_URL}/sign-and-send`, {
        userId,
        walletPublicKey: normalizedWalletPublicKey,
        serializedTransaction,
      });

      console.log('Response from signing service:', JSON.stringify(response.data, null, 2));
      res.status(200).json({ signature: response.data.signature });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error signing and sending transaction:', error.message);
      } else {
        console.error('Error signing and sending transaction:', String(error));
      }
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        res.status(404).json({ error: 'User or wallet not found' });
      } else {
        res.status(500).json({ error: 'Failed to sign and send transaction' });
      }
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}