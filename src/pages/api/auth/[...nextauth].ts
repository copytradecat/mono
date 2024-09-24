import NextAuth from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import GoogleProvider from 'next-auth/providers/google';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }: { session: any; token: any }) {
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
    async jwt({ token, account }: { token: any; account: any }) {
      if (account) {
        token.discordId = account.providerAccountId;
      }
      return token;
    },
  },
  secret: process.env.JWT_SECRET,
};

export default NextAuth(authOptions);
