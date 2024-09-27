import NextAuth, { Account, Profile, Session } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';
import dotenv from 'dotenv';
import { JWT } from 'next-auth/jwt';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';

dotenv.config({ path: '.env.local' });

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      await connectDB();
      await User.findOneAndUpdate(
        { name: profile.id },
        { 
          $setOnInsert: { 
            name: profile.id,
            discordId: profile.id,
            email: profile.email,
            settings: { maxTradeAmount: 100 } 
          } 
        },
        { upsert: true, new: true }
      );
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.discordId = account.providerAccountId;
        token.email = profile?.email || null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user = {
          ...session.user,
          name: token.discordId as string,
          email: token.email || session.user.email,
        } as Session['user'];
      }
      return session;
    },
  },
  secret: process.env.JWT_SECRET,
};

export default NextAuth(authOptions);
