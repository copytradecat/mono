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
  const [publicAddress, setPublicAddress] = useState();
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [walletCreated, setWalletCreated] = useState(false);
  const [storedWallets, setStoredWallets] = useState<any[]>([]);

  useEffect(() => {
    if (session) {
      fetchStoredWallets();
    }
  }, [session]);

  const fetchStoredWallets = async () => {
    const response = await fetch('/api/get-wallets');
    if (response.ok) {
      const data = await response.json();
      setStoredWallets(data.wallets);
    }
  };

  const handleCreateWallet = () => {
    const newKeypair = Keypair.generate();
    const seed = bs58.encode(newKeypair.secretKey);
    setWalletSeed(seed);
    setPublicAddress(newKeypair.publicKey);
    setWalletCreated(true);
  };

  const handleSaveWallet = async () => {
    if (!session || !walletSeed) return;

    const response = await fetch('/api/save-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: publicAddress,
        secretData: walletSeed,
        type: 'seed',
      }),
    });

    if (response.ok) {
      alert('Wallet saved successfully!');
      fetchStoredWallets();
    } else {
      const errorData = await response.json();
      alert(`Failed to save wallet: ${errorData.error}`);
    }
  };

  const handleImportWallet = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const seed = (event.currentTarget.elements.namedItem('seed') as HTMLInputElement).value;
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(seed));
      setWalletSeed(seed);
      setPublicAddress(keypair.publicKey.toBase58());
      setWalletCreated(true);
    } catch (error) {
      console.error('Invalid seed phrase');
      alert('Invalid seed phrase');
    }
  };

  if (!session) {
    return (
      <div>
        <h2>Sign in with Discord to get started</h2>
        <button onClick={() => signIn('discord')}>Sign in with Discord</button>
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
      {storedWallets.length > 0 && (
        <div>
          <h3>Stored Wallets</h3>
          {storedWallets.map((wallet, index) => (
            <p key={index}>Public Key: {wallet.publicKey}</p>
          ))}
        </div>
      )}
      <h3>Create or Import Wallet</h3>
      {!walletCreated && (
        <form onSubmit={handleImportWallet}>
          <input type="text" name="seed" placeholder="Enter seed phrase" />
          <button type="submit">Import Wallet</button>
        </form>
      )}
      {!walletCreated && <button onClick={handleCreateWallet}>Create New Wallet</button>}
      {walletCreated && (
        <div>
          <p>Public Address: {publicAddress?.toString()}</p>
          <button onClick={() => setShowPrivateKey(!showPrivateKey)}>
            {showPrivateKey ? 'Hide' : 'Reveal'} Private Key
          </button>
          {showPrivateKey && <p>Private Key: {walletSeed}</p>}
          <button onClick={handleSaveWallet}>Save Wallet</button>
        </div>
      )}
    </div>
  );
}
