import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';
import { decrypt } from '../../lib/encryption';
import { Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicKey } = req.query;

  if (!publicKey || typeof publicKey !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid publicKey' });
  }

  try {
    await connectDB();
    const user = await User.findOne({ 
      email: session.user.email,
      'wallets.publicKey': publicKey
    });

    if (!user) {
      return res.status(404).json({ error: 'User or wallet not found' });
    }

    const wallet = user.wallets.find(w => w.publicKey === publicKey);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const decryptedSecretData = decrypt(wallet.encryptedSecretData);
    const keypair = Keypair.fromSecretKey(bs58.decode(decryptedSecretData));

    // Create a function that signs the transaction
    const signTransaction = async (transaction: Transaction) => {
      transaction.partialSign(keypair);
      return transaction;
    };

    // Serialize the function to send it to the client
    const serializedSignTransaction = signTransaction.toString();

    res.status(200).json({ signTransaction: serializedSignTransaction });
  } catch (error) {
    console.error('Failed to get sign transaction function:', error);
    res.status(500).json({ error: 'Failed to get sign transaction function' });
  }
}
