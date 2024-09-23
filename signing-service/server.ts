import express from 'express';
import { Connection, Transaction, Keypair } from '@solana/web3.js';
import { decrypt } from '../src/lib/encryption';
import User from '../src/models/User';
import { connectDB } from '../src/lib/mongodb';
import dotenv from 'dotenv';
import { authMiddleware } from './authMiddleware';

dotenv.config();

const app = express();
app.use(express.json());
app.use(authMiddleware);

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

app.post('/sign-and-send', async (req, res) => {
  const { userId, walletPublicKey, serializedTransaction } = req.body;
  // Verify that the userId from the token matches the request
  if ((req as any).user.userId !== userId) {
    return res.status(403).json({ error: 'Forbidden: Invalid user' });
  }

  try {
    await connectDB();
    const user = await User.findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const wallet = user.wallets.find((w) => w.publicKey === walletPublicKey);

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for this user' });
    }

    const decryptedSecretData = decrypt(wallet.encryptedSecretData);
    const keypair = Keypair.fromSecretKey(Buffer.from(decryptedSecretData, 'base64'));

    const transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));
    transaction.partialSign(keypair);

    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    res.status(200).json({ signature });
  } catch (error) {
    console.error('Error signing and sending transaction:', error);
    res.status(500).json({ error: 'Failed to sign and send transaction' });
  }
});

const PORT = process.env.SIGNING_SERVICE_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Signing service running on port ${PORT}`);
});
