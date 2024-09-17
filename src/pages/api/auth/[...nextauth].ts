// src/pages/api/auth/[...nextauth].ts

import NextAuth from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user = {
          ...session.user,
          id: token.id as string,
          discordId: token.discordId as string | undefined
        } as {
          name?: string | null | undefined;
          email?: string | null | undefined;
          image?: string | null | undefined;
          id: string;
          discordId?: string;
        };
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (account && account.provider === 'discord') {
        token.discordId = account.providerAccountId;
      }
      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
