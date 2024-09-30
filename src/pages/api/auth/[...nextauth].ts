import NextAuth, { Account, NextAuthOptions, Profile, Session } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';
import dotenv from 'dotenv';
import { JWT } from 'next-auth/jwt';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';
import Subscription from '../../../models/Subscriptions';
import crypto from 'crypto';

dotenv.config();

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }: { user: any; account: any; profile: any }) {
      await connectDB();
      const referralCode = (profile as any).referralCode || null;

      try {
        // Find the latest user to get the highest account number
        const latestUser = await User.findOne().sort({ accountNumber: -1 });
        const newAccountNumber = latestUser ? (latestUser.accountNumber || 0) + 1 : 1;

        const newUser = await User.findOneAndUpdate(
          { discordId: profile.id },
          { 
            $setOnInsert: { 
              name: profile.id,
              discordId: profile.id,
              username: profile.username,
              email: profile.email,
              settings: { maxTradeAmount: 100 },
              referrer: referralCode,
            },
            $set: {
              accountNumber: newAccountNumber,
            }
          },
          { upsert: true, new: true }
        );

        // Create or update subscription
        await Subscription.findOneAndUpdate(
          { userId: newUser._id },
          { 
            $setOnInsert: { 
              level: 0,
            },
            $set: {
              referralCode: crypto.randomBytes(6).toString('hex'),
            }
          },
          { upsert: true, new: true }
        );

        if (referralCode) {
          await User.findOneAndUpdate(
            { referralCode },
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
          email: token.email || session.user.email,
        } as Session['user'];
      }
      return session;
    },
  },
  secret: process.env.JWT_SECRET,
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
} as NextAuthOptions;

export default NextAuth(authOptions);
