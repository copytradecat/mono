import express from 'express';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { decrypt } from '../src/lib/encryption';
import User from '../src/models/User';
import { connectDB } from '../src/lib/mongodb';
import dotenv from 'dotenv';
import bs58 from 'bs58';
import limiter from '../src/lib/limiter';
import { getConnection } from '../src/lib/utils';

dotenv.config();

const app = express();
app.use(express.json());

let connection: Connection;
async function ensureConnection() {
  if (!connection) {
    connection = await getConnection();
  }
  return connection;
}

app.post('/sign-and-send', async (req, res) => {
  // console.log('Received request in signing service');
  // console.log('Request body:', JSON.stringify(req.body, null, 2));

  const jobId = `sign-and-send-${Date.now()}`;

  try {
    await limiter.schedule({ id: jobId }, async () => {
      // console.log('Processing sign-and-send request');
      const { userId, walletPublicKey, serializedTransaction } = req.body;

      // console.log('Connecting to database');
      await connectDB();

      const user = await User.findOne({ discordId: userId });
      if (!user) {
        console.log('User not found');
        throw new Error('User not found');
      }

      const wallet = user.wallets.find((w) => w.publicKey === walletPublicKey);
      if (!wallet) {
        console.log('Wallet not found for this user');
        throw new Error('Wallet not found for this user');
      }

      if (!wallet.encryptedSecretData) {
        console.log('Encrypted secret data is missing for this wallet');
        throw new Error('Wallet secret data is missing');
      }

      const decryptedSecretData = decrypt(wallet.encryptedSecretData);
      const keypair = Keypair.fromSecretKey(bs58.decode(decryptedSecretData));

      const transaction = VersionedTransaction.deserialize(Buffer.from(serializedTransaction, 'base64'));
      transaction.sign([keypair]);
      const conn = await ensureConnection();
      // Send and confirm the transaction
      const signature = await conn.sendTransaction(transaction);
      console.log('Transaction sent. Signature:', signature);

      await conn.confirmTransaction(signature, 'confirmed');
      console.log('Transaction confirmed. Signature:', signature);

      res.status(200).json({ signature });
    });
  } catch (error) {
    console.error('Error in /sign-and-send:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: 'Failed to sign and send transaction', details: error.message });
  }
});

const PORT = process.env.SIGNING_SERVICE_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Signing service running on port ${PORT}`);
});