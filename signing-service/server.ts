import express from 'express';
import { Connection, Transaction, Keypair, VersionedMessage, VersionedTransaction } from '@solana/web3.js';
import { decrypt } from '../src/lib/encryption';
import User from '../src/models/User';
import { connectDB } from '../src/lib/mongodb';
import dotenv from 'dotenv';
import bs58 from 'bs58';
import Limiter from 'limiter';

dotenv.config({ path: ['.env.local', '.env'] });

const app = express();
app.use(express.json());

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

const { RateLimiter } = Limiter;
const limiter = new RateLimiter({ tokensPerInterval: 5, interval: 'second' });

app.post('/sign-and-send', async (req, res) => {
  console.log('Received request in signing service');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    await limiter.removeTokens(1);

    console.log('Received sign-and-send request');
    const { userId, walletPublicKey, serializedTransaction } = req.body;
    console.log('Request body:', { userId, walletPublicKey, serializedTransaction: serializedTransaction.substring(0, 50) + '...' });

    console.log('Connecting to database');
    await connectDB();

    
    // console.log('Finding user');
    const user = await User.findOne({ discordId: userId });
    // console.log('User found:', user ? 'Yes' : 'No');
    // console.log('User data:', JSON.stringify(user, null, 2));

    if (!user) {
      console.log('User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    // console.log('Finding wallet');
    // console.log('User wallets:', JSON.stringify(user.wallets, null, 2));
    // console.log('Wallet public key to find:', walletPublicKey);

    const wallet = user.wallets.find((w) => 
      w.publicKey === walletPublicKey
    );

    if (!wallet) {
      console.log('Wallet not found for this user');
      return res.status(404).json({ error: 'Wallet not found for this user' });
    }

    // console.log('Found wallet:', JSON.stringify(wallet, null, 2));

    if (!wallet.encryptedSecretData) {
      console.log('Encrypted secret data is missing for this wallet');
      return res.status(400).json({ error: 'Wallet secret data is missing' });
    }

    // console.log('Decrypting secret data');
    const decryptedSecretData = decrypt(wallet.encryptedSecretData);
    // console.log('Decrypted secret data length:', decryptedSecretData.length);

    // Corrected line: Use bs58.decode instead of Buffer.from with 'base64'
    const keypair = Keypair.fromSecretKey(bs58.decode(decryptedSecretData));
    // console.log('Generated keypair public key:', keypair.publicKey.toBase58());

    // console.log('Deserializing transaction');
    const transaction = VersionedTransaction.deserialize(Buffer.from(serializedTransaction, 'base64'));

    // console.log('Partially signing transaction');
    transaction.sign([keypair]);

    try {
      console.log('Sending raw transaction');
      const signature = await connection.sendTransaction(transaction);
      console.log('Transaction sent. Signature:', signature);

      // Implement retry mechanism
      const maxRetries = 5;
      const retryDelay = 5000; // 5 seconds
      let confirmed = false;

      for (let i = 0; i < maxRetries; i++) {
        try {
          console.log(`Attempt ${i + 1} to confirm transaction`);
          await connection.confirmTransaction(signature, 'confirmed');
          confirmed = true;
          break;
        } catch (confirmError) {
          if (i === maxRetries - 1) {
            throw confirmError;
          }
          console.log(`Confirmation attempt ${i + 1} failed. Retrying in ${retryDelay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      if (confirmed) {
        console.log('Transaction confirmed. Signature:', signature);
        res.status(200).json({ signature });
      } else {
        console.log('Transaction not confirmed after multiple attempts');
        res.status(202).json({ signature, message: 'Transaction sent but not confirmed. Please check the signature for status.' });
      }
    } catch (error) {
      console.error('Error signing and sending transaction:', error);
      if (error.logs) {
        console.error('Transaction logs:', error.logs);
      }
      if (error instanceof Error && error.message.includes('TransactionExpiredTimeoutError')) {
        res.status(202).json({ 
          error: 'Transaction sent but confirmation timed out', 
          signature: error.signature, 
          message: 'Please check the signature for status.'
        });
      } else {
        res.status(500).json({ error: 'Failed to sign and send transaction', logs: error.logs });
      }
    }
  } catch (error) {
    console.error('Error in /sign-and-send:', error);

    res.status(500).json({
      error: 'Failed to sign and send transaction',
      details: error.message,
      logs: error.stack, // Include stack trace if helpful
    });
  }
});

const PORT = process.env.SIGNING_SERVICE_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Signing service running on port ${PORT}`);
});