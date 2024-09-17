import { useWallet } from '@jup-ag/wallet-adapter';

export default function WalletConnectionButton() {
  const { connected, connect, disconnect } = useWallet();

  return (
    <div>
      {connected ? (
        <button onClick={disconnect}>Disconnect</button>
      ) : (
        <button onClick={connect}>Connect Wallet</button>
      )}
    </div>
  );
}
