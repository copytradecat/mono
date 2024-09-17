import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useWallet } from '@jup-ag/wallet-adapter';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { encrypt } from '../lib/encryption';

export default function SignInInterface() {
  const { data: session } = useSession();
  const { connected, connect, publicKey } = useWallet();
  const [walletSeed, setWalletSeed] = useState('');
  const [storedWallet, setStoredWallet] = useState<any>(null);

  useEffect(() => {
    if (session) {
      fetchStoredWallet();
    }
  }, [session]);

  const fetchStoredWallet = async () => {
    const response = await fetch('/api/get-wallet');
    if (response.ok) {
      const data = await response.json();
      setStoredWallet(data.wallet);
    }
  };

  const handleCreateWallet = () => {
    const newKeypair = Keypair.generate();
    const seed = bs58.encode(newKeypair.secretKey);
    setWalletSeed(seed);
  };

  const handleImportWallet = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const seed = (event.currentTarget.elements.namedItem('seed') as HTMLInputElement).value;
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(seed));
      setWalletSeed(seed);
    } catch (error) {
      console.error('Invalid seed phrase');
      alert('Invalid seed phrase');
    }
  };

  const handleSaveWallet = async () => {
    if (!session || !walletSeed) return;

    const encryptedSeed = encrypt(walletSeed);

    const response = await fetch('/api/save-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedSeed }),
    });

    if (response.ok) {
      alert('Wallet saved successfully!');
      fetchStoredWallet();
    } else {
      alert('Failed to save wallet');
    }
  };

  if (!session) {
    return (
      <div>
        <h2>Sign in to get started</h2>
        <button onClick={() => signIn()}>Sign in</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Welcome, {session?.user?.email || 'Friend'}</h2>
      <button onClick={() => signOut()}>Sign Out</button>
      {!connected ? (
        <button onClick={connect}>Connect Wallet</button>
      ) : (
        <p>Wallet connected: {publicKey?.toBase58()}</p>
      )}
      <h3>Create or Import Wallet</h3>
      <button onClick={handleCreateWallet}>Create New Wallet</button>
      <form onSubmit={handleImportWallet}>
        <input type="text" name="seed" placeholder="Enter seed phrase" />
        <button type="submit">Import Wallet</button>
      </form>
      {walletSeed && (
        <div>
          <p>Wallet Seed: {walletSeed}</p>
          <button onClick={handleSaveWallet}>Save Wallet</button>
        </div>
      )}
      {storedWallet && (
        <div>
          <h3>Stored Wallet</h3>
          <p>Public Key: {storedWallet.publicKey}</p>
        </div>
      )}
    </div>
  );
}
