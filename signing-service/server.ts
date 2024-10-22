import express from 'express';
// import bodyParser from 'body-parser';
import { Connection, Keypair, VersionedTransaction, TransactionSignature, Commitment } from '@solana/web3.js';
import { decrypt } from '../src/lib/encryption';
import { confirmTransactionWithRetry } from '../src/services/signing.service';
import User from '../src/models/User';
import { connectDB } from '../src/lib/mongodb';
import dotenv from 'dotenv';
import bs58 from 'bs58';
import limiter from '../src/lib/limiter';
import { getConnection } from '../src/lib/utils';

dotenv.config({ path: ['.env.local', '.env'] });

const app = express();
app.use(express.json());

let connection: Connection;
async function ensureConnection() {
  if (!connection) {
    connection = await getConnection();
  }
  return connection;
}

const poolingWalletPrivateKey = process.env.POOLING_WALLET_PRIVATE_KEY;
if (!poolingWalletPrivateKey) {
  throw new Error('POOLING_WALLET_PRIVATE_KEY is not set in environment variables.');
}
const poolingWalletKeypair = Keypair.fromSecretKey(bs58.decode(poolingWalletPrivateKey));

app.post('/sign-and-send', async (req, res) => {
  // console.log('Received request in signing service');
  // console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    const uniqueJobId = `sign-and-send-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await limiter.schedule({ id: uniqueJobId }, async () => {
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
      // Check if the transaction's fee payer matches the wallet public key
      if (transaction.message.staticAccountKeys[0].toBase58() !== walletPublicKey) {
        throw new Error('Transaction fee payer does not match the provided wallet public key');
      }

      transaction.sign([keypair]);
      const conn = await ensureConnection();
      
      // Send and confirm the transaction
      const signature = await conn.sendTransaction(transaction);
      console.log('Transaction sent. Signature:', signature);

      try {
        await confirmTransactionWithRetry(conn, signature, 'confirmed', 20, 1000);
        console.log('Transaction confirmed. Signature:', signature);
        res.status(200).json({ signature });
      } catch (confirmError) {
        console.error('Transaction confirmation failed:', confirmError);
        res.status(202).json({ 
          signature, 
          status: 'unconfirmed', 
          message: 'Transaction sent but not confirmed. Please check the signature.'
        });
      }
    });
  } catch (error) {
    console.error('Error in /sign-and-send:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: 'Failed to sign and send transaction', details: error.message });
  }
});
app.post('/sign-and-send-pooling-wallet', async (req, res) => {
  try {
    const { serializedTransaction } = req.body;
    const transaction = VersionedTransaction.deserialize(Buffer.from(serializedTransaction, 'base64'));

    // Set the recent blockhash and fee payer if not already set
    if (!transaction.recentBlockhash) {
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    }
    if (!transaction.feePayer) {
      transaction.feePayer = poolingWalletKeypair.publicKey;
    }

    transaction.sign([poolingWalletKeypair]);
    const conn = await ensureConnection();

    const signature = await conn.sendTransaction(transaction);
    console.log('Pooling wallet transaction sent. Signature:', signature);

    // Optionally confirm the transaction
    await conn.confirmTransaction(signature, 'confirmed');
    console.log('Pooling wallet transaction confirmed. Signature:', signature);

    res.status(200).json({ signature });
  } catch (error) {
    console.error('Error in /sign-and-send-pooling-wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.SIGNING_SERVICE_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Signing service running on port ${PORT}`);
});
