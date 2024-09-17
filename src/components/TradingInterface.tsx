import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

export default function TradingInterface() {
  const { publicKey, signTransaction } = useWallet();
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('');

  const handleTrade = async () => {
    if (!publicKey || !signTransaction) return;

    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);
    
    // Create a sample transaction (replace with actual trading logic)
    const transaction = new Transaction().add(
      // Add instructions here based on amount and token
    );

    try {
      const signedTx = await signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signedTx.serialize());
      console.log(`Transaction sent: ${txid}`);
      // Call API to store trade information
      await fetch('/api/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: publicKey.toBase58(), txid, amount, token }),
      });
    } catch (error) {
      console.error('Error executing trade:', error);
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Trading Interface</h2>
      <WalletMultiButton />
      {publicKey && (
        <div className="mt-4">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-full p-2 mb-2 border rounded"
          />
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token"
            className="w-full p-2 mb-2 border rounded"
          />
          <button
            onClick={handleTrade}
            className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Execute Trade
          </button>
        </div>
      )}
    </div>
  );
}
