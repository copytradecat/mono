import NextAuth, { Account, Profile, Session } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';
import dotenv from 'dotenv';
import { JWT } from 'next-auth/jwt';
import connectDB from '../../../lib/mongodb';
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
    async jwt({ token, account, profile }: { token: JWT; account: Account; profile: Profile }) {
      if (account) {
        token.discordId = account.providerAccountId;
        token.email = profile?.email || null;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user = {
          ...session.user,
          id: token.discordId as string,
          discordId: token.discordId as string,
          email: token.email || session.user.email,
        };

        // Update user record to include email
        await connectDB();
        if (session.user && session.user.id) {
          await User.findOneAndUpdate(
            { discordId: session.user.id },
            { $set: { email: session.user.email } },
            { upsert: false } // User should already exist
          );
        }
        return session;
      }
    },
  },
  secret: process.env.JWT_SECRET,
};

export default NextAuth(authOptions);
