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

dotenv.config();

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      await connectDB();

      try {
        // Assert that 'profile' is a DiscordProfile
        const discordProfile = profile as DiscordProfile;

        const latestUser = await User.findOne().sort({ accountNumber: -1 });
        const newAccountNumber = latestUser
          ? (latestUser.accountNumber || 0) + 1
          : 1;

        // Check if there's a referral code in the session
        const referralCode = (discordProfile as any).r;

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

        // If there's a referral code, update the referrer's referrals array
        if (referralCode) {
          await User.findOneAndUpdate(
            { accountNumber: parseInt(referralCode) },
            { $addToSet: { referrals: newUser.discordId } }
          );
        }

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
    async redirect({ url, baseUrl }) {
      // Handle referral
      const urlParams = new URL(url).searchParams;
      const referralCode = urlParams.get('r');
      if (referralCode) {
        // Store the referral code in the session
        return `${url}&r=${referralCode}`;
      }
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
  },
  secret: process.env.JWT_SECRET,
};

export default NextAuth(authOptions);