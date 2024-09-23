import NextAuth from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config({ path: ['.env.local', '.env'] });

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && account.provider === 'discord') {
        token.discordId = account.providerAccountId;
      }
      if (user) {
        token.id = user.id;
      }
      // Generate JWT without adding another expiration
      const encodedToken = jwt.sign(token, process.env.JWT_SECRET!);
      token.encodedToken = encodedToken;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user = {
          ...session.user,
          id: token.id as string,
          discordId: token.discordId as string | undefined,
          encodedToken: token.encodedToken as string
        } as {
          name?: string | null | undefined;
          email?: string | null | undefined;
          image?: string | null | undefined;
          id: string;
          discordId?: string;
          encodedToken: string;
        };
      }
      return session;
    },
  },
  secret: process.env.JWT_SECRET,
};

export default NextAuth(authOptions);
