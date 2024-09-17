import { useMemo } from 'react';
import { AppProps } from 'next/app';
import { SessionProvider } from "next-auth/react";
import { UnifiedWalletProvider, WalletAdapterNetwork } from '@jup-ag/wallet-adapter';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { Connection } from '@solana/web3.js';
import WalletNotification from '../components/WalletNotification'; // Adjust the path accordingly

function MyApp({ Component, pageProps }: AppProps) {
  // Initialize Solana connection
  const connection = useMemo(() => new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!), []);

  // Define wallets
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  // Combine wallets and config into a single params object
  const params = useMemo(() => ({
    wallets,
    config: {
      autoConnect: false,
      env: WalletAdapterNetwork.Mainnet,
      metadata: {
        name: 'CopyTradeCat',
        description: 'CopyTradeCat',
        url: 'https://copytradecat.com',
        iconUrls: ['https://copytradecat.com'],
      },
      notificationCallback: WalletNotification,
      walletlistExplanation: {
        href: 'https://station.jup.ag/docs/additional-topics/wallet-list',
      },
      provider: connection, // Added the 'provider' property
    },
  }), [wallets, connection]);

  return (
    <SessionProvider session={pageProps.session}>
      <UnifiedWalletProvider wallets={params.wallets} config={params.config}>
        <Component {...pageProps} />
      </UnifiedWalletProvider>
    </SessionProvider>
  );
}

export default MyApp;
