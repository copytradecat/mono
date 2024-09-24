import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
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

    if (session) {
      user = await User.findOne({ email: session.user.email });
    } else {
      const { userId } = req.body;
      user = await User.findOne({ _id: userId });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.method === 'GET') {
      res.status(200).json({ settings: user.settings });
    } else if (req.method === 'POST') {
      const { settings } = req.body;
      user.settings = settings;
      await user.save();
      res.status(200).json({ message: 'Settings updated successfully', settings: user.settings });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Failed to handle bot settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
