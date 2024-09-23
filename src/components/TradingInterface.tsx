import React, { useState } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getQuote, getSwapTransaction, executeSwap } from '../services/jupiter.service';
import axios from 'axios';

interface TradingInterfaceProps {
  selectedWallet: string | null;
  userId: string;
}

export default function TradingInterface({ selectedWallet, userId }: TradingInterfaceProps) {
  const [inputToken, setInputToken] = useState('So11111111111111111111111111111111111111112');
  const [outputToken, setOutputToken] = useState('jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v');
  const [amount, setAmount] = useState('0.0000001');
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [swapResult, setSwapResult] = useState<string | null>(null);

  const handleGetQuote = async () => {
    if (!selectedWallet || !inputToken || !outputToken || !amount) {
      alert('Please select a wallet and fill in all fields');
      return;
    }

    try {
      const quote = await getQuote(inputToken, outputToken, parseFloat(amount));
      setQuoteResult(quote);
    } catch (error) {
      console.error('Error getting quote:', error);
      alert(`Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSubmitSwap = async () => {
    if (!selectedWallet || !quoteResult) {
      alert('Please select a wallet and get a quote first');
      return;
    }

    try {
      const swapTransaction = await getSwapTransaction(quoteResult, selectedWallet);

      // Send the serialized transaction to the signing service
      const response = await axios.post('/api/sign-and-send', {
        userId,
        walletPublicKey: selectedWallet,
        serializedTransaction: swapTransaction.swapTransaction,
      });

      const { signature } = response.data;
      setSwapResult(signature);

      // Optionally, you can save the transaction in your database or update the UI accordingly
    } catch (error) {
      console.error('Error executing swap:', error);
      alert(`Failed to execute swap: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Trading Interface</h2>
      {selectedWallet ? (
        <div>
          <p>Selected Wallet: {selectedWallet}</p>
          <input
            type="text"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            placeholder="Input Token (e.g., SOL)"
            className="w-full p-2 mb-2 border rounded"
          />
          <input
            type="text"
            value={outputToken}
            onChange={(e) => setOutputToken(e.target.value)}
            placeholder="Output Token (e.g., USDC)"
            className="w-full p-2 mb-2 border rounded"
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-full p-2 mb-2 border rounded"
          />
          <button
            onClick={handleGetQuote}
            className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 mb-2"
          >
            Get Swap Preview
          </button>
          {quoteResult && (
            <div className="mb-2">
              <h3 className="font-bold">Swap Preview:</h3>
              <pre className="bg-gray-100 p-2 rounded">
                {JSON.stringify(quoteResult, null, 2)}
              </pre>
            </div>
          )}
          <button
            onClick={handleSubmitSwap}
            className="w-full p-2 bg-green-500 text-white rounded hover:bg-green-600"
            disabled={!quoteResult}
          >
            Submit Swap
          </button>
          {swapResult && (
            <div className="mt-2">
              <h3 className="font-bold">Swap Result:</h3>
              <p>Transaction Signature: {swapResult}</p>
            </div>
          )}
        </div>
      ) : (
        <p>Please select a wallet to start trading.</p>
      )}
    </div>
  );
}