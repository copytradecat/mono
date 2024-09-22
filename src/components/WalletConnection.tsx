import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { rateLimitedRequest } from '../services/jupiter.service';

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!);

interface TokenBalance {
  mint: string;
  balance: number;
}

interface WalletConnectionProps {
  channelId: string | null;
}

export default function WalletConnection({ channelId }: WalletConnectionProps) {
  const { publicKey, connected } = useWallet();
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchTokenBalances(publicKey);
      connectWalletToChannel(publicKey.toString(), channelId);
    }
  }, [connected, publicKey, channelId]);

  async function fetchTokenBalances(publicKey: PublicKey) {
    try {
      const tokenAccounts = await rateLimitedRequest(() => 
        connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        })
      );

      const balances = tokenAccounts.value.map((accountInfo) => ({
        mint: accountInfo.account.data.parsed.info.mint,
        balance: accountInfo.account.data.parsed.info.tokenAmount.uiAmount,
      }));

      setTokenBalances(balances);
    } catch (error) {
      console.error('Error fetching token balances:', error);
    }
  }

  async function connectWalletToChannel(walletAddress: string, channelId: string | null) {
    if (!channelId) return;

    try {
      const response = await fetch('/api/connect-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress, channelId }),
      });

      if (response.ok) {
        console.log('Wallet connected to channel successfully');
      } else {
        console.error('Failed to connect wallet to channel');
      }
    } catch (error) {
      console.error('Error connecting wallet to channel:', error);
    }
  }

  return (
    <div>
      <WalletMultiButton />
      {connected && (
        <div>
          <h2>Token Balances:</h2>
          <ul>
            {tokenBalances.map((token, index) => (
              <li key={index}>
                {token.mint}: {token.balance}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}