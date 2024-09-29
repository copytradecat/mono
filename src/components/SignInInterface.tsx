import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function SignInInterface() {
  const { data: session } = useSession();

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
      {/* {!connected ? (
        <button onClick={connect}>Connect Wallet</button>
      ) : (
        <p>Wallet connected: {publicKey?.toBase58()}</p>
      )} */}
    </div>
  );
}
