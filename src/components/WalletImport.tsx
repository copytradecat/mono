import { useState } from 'react';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

interface WalletImportProps {
  onWalletAdded: () => void;
}

export default function WalletImport({ onWalletAdded }: WalletImportProps) {
  const [seed, setSeed] = useState('');
  const [publicKey, setPublicKey] = useState('');

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(seed));
      setPublicKey(keypair.publicKey.toBase58());
      await saveWallet(keypair.publicKey.toBase58(), seed);
      onWalletAdded();
    } catch (error) {
      console.error('Invalid seed phrase');
      alert('Invalid seed phrase');
    }
  };

  const handleCreate = async () => {
    const keypair = Keypair.generate();
    setPublicKey(keypair.publicKey.toBase58());
    setSeed(bs58.encode(keypair.secretKey));
    await saveWallet(keypair.publicKey.toBase58(), bs58.encode(keypair.secretKey));
    onWalletAdded();
  };

  const saveWallet = async (publicKey: string, privateKey: string) => {
    const response = await fetch('/api/save-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey, privateKey }),
    });

    if (response.ok) {
      alert('Wallet saved successfully!');
      onWalletAdded();
    } else {
      alert('Failed to save wallet. Please try again.');
    }
  };

  return (
    <div>
      <h2>Import or Create Wallet</h2>
      <form onSubmit={handleImport}>
        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="Enter seed phrase"
        />
        <button type="submit">Import Wallet</button>
      </form>
      <button onClick={handleCreate}>Create New Wallet</button>
      {publicKey && <p>Public Key: {publicKey}</p>}
    </div>
  );
}
