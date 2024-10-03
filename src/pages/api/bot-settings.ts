import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import User from '../../models/User';
import { connectDB } from '../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const botApiKey = req.headers['x-bot-api-key'];
    const session = await getServerSession(req, res, authOptions);

    if (!session && botApiKey !== process.env.BOT_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await connectDB();
    let user;
    if (session && session.user) {
      user = await User.findOne({ discordId: session.user.name });
    } else {
      const { userId } = req.body;
      user = await User.findOne({ _id: userId });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { walletPublicKey } = req.query;

    if (req.method === 'GET') {
      let settings;
      if (walletPublicKey) {
        const wallet = user.wallets.find((w: any) => w.publicKey === walletPublicKey);
        settings = wallet?.settings || user.settings;
      } else {
        settings = user.settings;
      }
      res.status(200).json({ settings });
    } else if (req.method === 'POST') {
      const { settings, presetName, walletPublicKey } = req.body;

      // Validate transactionSpeed
      if (
        !['medium', 'high', 'veryHigh', 'custom', 'auto'].includes(settings.transactionSpeed)
      ) {
        return res.status(400).json({ error: 'Invalid transactionSpeed value' });
      }

      // Validate priorityFee
      if (
        settings.transactionSpeed === 'custom' &&
        (typeof settings.priorityFee !== 'number' || isNaN(settings.priorityFee))
      ) {
        return res.status(400).json({ error: 'Invalid priorityFee value' });
      }

      if (walletPublicKey) {
        await User.updateOne(
          { discordId: session.user?.name, 'wallets.publicKey': walletPublicKey },
          { 
            $set: { 
              'wallets.$.settings': settings,
              'wallets.$.presetName': presetName
            } 
          }
        );
      } else {
        user.settings = settings;
        await user.save();
      }
      res.status(200).json({ message: 'Settings updated successfully', settings });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in bot-settings API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}