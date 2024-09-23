import axios from 'axios';

const SIGNING_SERVICE_URL = process.env.SIGNING_SERVICE_URL || 'http://localhost:3001';

export async function signAndSendTransaction(userId: string, walletPublicKey: string, serializedTransaction: string): Promise<string> {
  try {
    const response = await axios.post(`${SIGNING_SERVICE_URL}/sign-and-send`, {
      userId,
      walletPublicKey,
      serializedTransaction,
    });

    return response.data.signature;
  } catch (error) {
    console.error('Error signing and sending transaction:', error);
    throw new Error('Failed to sign and send transaction');
  }
}