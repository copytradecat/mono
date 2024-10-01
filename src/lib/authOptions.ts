import NextAuth, { NextAuthOptions } from 'next-auth';
import DiscordProvider, { DiscordProfile } from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';
import dotenv from 'dotenv';
import { connectDB } from './mongodb';
import User from '../models/User';
import Subscription from '../models/Subscriptions';
import { Session } from 'next-auth';

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
        const discordProfile = profile as DiscordProfile;

        const latestUser = await User.findOne().sort({ accountNumber: -1 });
        const newAccountNumber = latestUser
          ? (latestUser.accountNumber || 0) + 1
          : 1;

        // Check if the user already exists
        let existingUser = await User.findOne({ discordId: discordProfile.id });

        if (existingUser) {
          // User exists, update only if necessary
          if (!existingUser.accountNumber) {
            existingUser.accountNumber = newAccountNumber;
            await existingUser.save();
          }
        } else {
          // Create new user
          existingUser = await User.create({
            name: discordProfile.id,
            discordId: discordProfile.id,
            username: discordProfile.username,
            email: discordProfile.email,
            settings: { maxTradeAmount: 100 },
            accountNumber: newAccountNumber,
          });
        }

        if (discordProfile.id) {
          await Subscription.findOneAndUpdate(
            { discordId: discordProfile.id },
            {
              $setOnInsert: { level: 0 },
            },
            { upsert: true, new: true }
          );
        }

        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
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