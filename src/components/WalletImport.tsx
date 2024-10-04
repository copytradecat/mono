import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { useWallets } from '../hooks/useWallets';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, AccountLayout } from '@solana/spl-token';

interface WalletImportProps {
  onWalletAdded: () => void;
}

export default function WalletImport({ onWalletAdded }: WalletImportProps) {
  const { data: session } = useSession();
  const { wallets, isLoading, error, fetchWallets } = useWallets();
  const [walletCreated, setWalletCreated] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [walletSeed, setWalletSeed] = useState('');
  const [publicAddress, setPublicAddress] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  let timeout: NodeJS.Timeout | null = null;

  const handleCreateWallet = () => {
    const newKeypair = Keypair.generate();
    const seed = bs58.encode(newKeypair.secretKey);
    setWalletSeed(seed);
    setPublicAddress(newKeypair.publicKey.toBase58());
    setWalletCreated(true);
    setSaved(1);
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
      alert('Wallet saved successfully!\nPlease remember to backup your private key.');
      fetchWallets();
      onWalletAdded();
    } else {
      const errorData = await response.json();
      alert(`Failed to save wallet: ${errorData.error}`);
    }
  };

  const clearForm = () => {
    if (saved === 1) {
      setSaved(2);
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        setSaved(1);
      }, 5000);
    } else {
      setWalletSeed('');
      setPublicAddress(null);
      setWalletCreated(false);
      setSaved(0);
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
      console.error('Invalid private key');
      alert('Invalid private key');
    }
  };







  // const [input, setInput] = useState('');
  // const [publicKey, setPublicKey] = useState('');
  // const [importType, setImportType] = useState<'seed' | 'privateKey'>('seed');

  // const handleImportSeed = async (event: React.FormEvent<HTMLFormElement>) => {
  //   event.preventDefault();
  //   try {
  //     let keypair: Keypair;
  //     if (importType === 'seed') {
  //       keypair = Keypair.fromSecretKey(bs58.decode(input));
  //     } else {
  //       // Assuming the private key is in base58 format
  //       const privateKey = bs58.decode(input);
  //       keypair = Keypair.fromSecretKey(privateKey);
  //     }
  //     const publicKey = keypair.publicKey.toBase58();
  //     await saveWallet(publicKey, input, importType);
  //     setPublicKey(publicKey);
  //     onWalletAdded();
  //   } catch (error) {
  //     console.error('Invalid input:', error);
  //     alert('Invalid input. Please check and try again.');
  //   }
  // };
  // const handleCreate = async () => {
  //   const keypair = Keypair.generate();
  //   setPublicKey(keypair.publicKey.toBase58());
  //   const seed = bs58.encode(keypair.secretKey);
  //   setInput(seed);
  //   await saveWallet(keypair.publicKey.toBase58(), seed, 'seed');
  //   onWalletAdded();
  // };
  // const saveWallet = async (publicKey: string, secretData: string, type: 'seed' | 'privateKey') => {
  //   try {
  //     const response = await fetch('/api/save-wallet', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({ publicKey, secretData, type }),
  //     });

  //     if (!response.ok) {
  //       const errorData = await response.json();
  //       throw new Error(errorData.error || 'Failed to save wallet');
  //     }

  //     const data = await response.json();
  //     console.log('Wallet saved successfully:', data);
  //     // Refresh the wallet list
  //     fetchWallets();
  //     onWalletAdded(); // If you want to notify the parent component
  //   } catch (error) {
  //     console.error('Error saving wallet:', error);
  //     // Handle the error (e.g., show an error message to the user)
  //   }
  // };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Create or Import Wallet</h2>
      {!walletCreated && (
        <form onSubmit={handleImportWallet} className="mb-4">
          <input type="text" name="seed" placeholder="Enter private key" className="mr-2 p-2 border rounded" />
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">Import Wallet</button>
        </form>
      )}
      {!walletCreated && <button onClick={handleCreateWallet} className="bg-green-500 text-white px-4 py-2 rounded mb-6">Create New Wallet</button>}
      {walletCreated && (
        <div className="mb-6">
          <p>Public Address: {publicAddress?.toString()}&nbsp;
          <button onClick={() => setShowPrivateKey(!showPrivateKey)} className="bg-yellow-500 text-white px-4 py-2 rounded mr-2">
            {showPrivateKey ? 'Hide' : 'Reveal'} Private Key
          </button>
          </p>
          {showPrivateKey && <p>Private Key: {walletSeed}</p>}
          <button onClick={handleSaveWallet} disabled={saved === 1 || saved === 2} className="bg-blue-500 text-white px-4 py-2 rounded">{saved === 0 ? 'Save Wallet' : 'Wallet Saved'}</button>
          &nbsp;
          {publicAddress && <button onClick={() => clearForm()} className="bg-yellow-500 text-white px-4 py-2 rounded mr-2">
          {saved === 1 ? 'clear form' : saved === 2 ?'are you sure you want to clear the form? private key only shown here once.' : 'key backed up. clear form.'}
          </button>}
        </div>
      )}
    </div>
  );
}
