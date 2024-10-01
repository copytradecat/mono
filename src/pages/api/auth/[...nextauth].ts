import NextAuth, {
  Account,
  NextAuthOptions,
  Profile,
  Session,
  User as NextAuthUser,
} from 'next-auth';

import DiscordProvider, { DiscordProfile } from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';
import dotenv from 'dotenv';
import { JWT } from 'next-auth/jwt';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';
import Subscription from '../../../models/Subscriptions';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      await connectDB();

      try {
        // Assert that 'profile' is a DiscordProfile
        const discordProfile = profile as DiscordProfile;

        const latestUser = await User.findOne().sort({ accountNumber: -1 });
        const newAccountNumber = latestUser
          ? (latestUser.accountNumber || 0) + 1
          : 1;

        const newUser = await User.findOneAndUpdate(
          { discordId: discordProfile.id },
          {
            $setOnInsert: {
              name: discordProfile.id,
              discordId: discordProfile.id,
              username: discordProfile.username,
              email: discordProfile.email,
              settings: { maxTradeAmount: 100 },
              accountNumber: newAccountNumber,
            },
          },
          { upsert: true, new: true }
        );

        await Subscription.findOneAndUpdate(
          { discordId: newUser.discordId },
          {
            $setOnInsert: {
              level: 0,
            },
          },
          { upsert: true, new: true }
        );

        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    },
    async jwt({ token, account, profile }: { token: JWT; account: Account | null; profile?: Profile }) {
      if (account) {
        token.discordId = account.providerAccountId;
        token.email = profile?.email || null;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user = {
          ...session.user,
          name: token.discordId as string,
          discordId: token.discordId as string,
          email: token.email || session.user.email,
        } as Session['user'];
      }
      return session;
    },
    // async redirect({ url, baseUrl }) {
    //   const urlObj = new URL(url);
    //   if (urlObj.searchParams.has('r')) {
    //     // Referral code is already present; do not append it again
    //     return url;
    //   }
    //   return url.startsWith(baseUrl) ? url : baseUrl;
    // },
  },
  secret: process.env.JWT_SECRET,
};

export default NextAuth(authOptions);