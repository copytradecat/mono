// src/pages/_app.tsx

import { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { WalletAdapterNetwork, UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useMemo } from 'react';
import NavMenu from '../components/NavMenu';
// import '../styles/globals.css';
type UnifiedSupportedProvider = 'solana-wallet-adapter' | 'walletconnect';
function MyApp({ Component, pageProps }: AppProps) {
  const network = WalletAdapterNetwork.Devnet;

  const wallets = useMemo(
    () => [
      // Add wallet adapters compatible with `@jup-ag/wallet-adapter`
    ],
    []
  );

  const config = useMemo(
    () => ({
      autoConnect: false,
      env: network,
      provider: 'solana-wallet-adapter' as UnifiedSupportedProvider,
      metadata: {
        name: 'CopyTradeCat',
        description: 'CopyTradeCat',
        url: 'https://copytradecat.com',
        iconUrls: ['https://copytradecat.com'],
      },
      walletAttachments: { 
        'Phantom': {
          attachment: <div tw="text-xs rounded-md bg-red-500 px-2 mx-2 text-center">Auto Confirm</div>
        } 
      }
      // Add any additional config options
    }),
    [network]
  );

  return (
    <SessionProvider session={pageProps.session}>
      <UnifiedWalletProvider wallets={wallets} config={config}>
        <NavMenu />
        <Component {...pageProps} />
      </UnifiedWalletProvider>
    </SessionProvider>
  );
}

export default MyApp;
