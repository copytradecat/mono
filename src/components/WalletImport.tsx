import { useState } from 'react';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

interface WalletImportProps {
  onWalletAdded: () => void;
}

export default function WalletImport({ onWalletAdded }: WalletImportProps) {
  const [input, setInput] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [importType, setImportType] = useState<'seed' | 'privateKey'>('seed');

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      let keypair: Keypair;
      if (importType === 'seed') {
        keypair = Keypair.fromSecretKey(bs58.decode(input));
      } else {
        // Assuming the private key is in base58 format
        const privateKey = bs58.decode(input);
        keypair = Keypair.fromSecretKey(privateKey);
      }
      setPublicKey(keypair.publicKey.toBase58());
      await saveWallet(keypair.publicKey.toBase58(), input, importType);
      onWalletAdded();
    } catch (error) {
      console.error('Invalid input:', error);
      alert('Invalid input. Please check and try again.');
    }
  };

  const handleCreate = async () => {
    const keypair = Keypair.generate();
    setPublicKey(keypair.publicKey.toBase58());
    const seed = bs58.encode(keypair.secretKey);
    setInput(seed);
    await saveWallet(keypair.publicKey.toBase58(), seed, 'seed');
    onWalletAdded();
  };

  const saveWallet = async (publicKey: string, secretData: string, type: 'seed' | 'privateKey') => {
    try {
      const response = await fetch('/api/save-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey, secretData, type }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Wallet saved successfully:', data);
        console.log('Saved wallet public key:', publicKey);
        alert('Wallet saved successfully!');
      } else {
        console.error('Failed to save wallet:', data);
        alert(`Failed to save wallet. Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error saving wallet:', error);
      alert(`An error occurred while saving the wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div>
      <h2>Import or Create Wallet</h2>
      <form onSubmit={handleImport}>
        <select value={importType} onChange={(e) => setImportType(e.target.value as 'seed' | 'privateKey')}>
          <option value="seed">Seed Phrase</option>
          <option value="privateKey">Private Key</option>
        </select>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={importType === 'seed' ? "Enter seed phrase" : "Enter private key"}
        />
        <button type="submit">Import Wallet</button>
      </form>
      <button onClick={handleCreate}>Create New Wallet</button>
      {publicKey && <p>Public Key: {publicKey}</p>}
    </div>
  );
}
