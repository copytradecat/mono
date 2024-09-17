import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import User from '../../models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const user = await User.findOne({ discordId: session.user.id });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.status(200).json({ settings: user.settings });
    } catch (error) {
      console.error('Failed to retrieve settings:', error);
      res.status(500).json({ error: 'Failed to retrieve settings' });
    }
  } else if (req.method === 'POST') {
    const { setting, value } = req.body;
    try {
      const user = await User.findOneAndUpdate(
        { discordId: session.user.id },
        { $set: { [`settings.${setting}`]: value } },
        { new: true }
      );
      res.status(200).json({ settings: user.settings });
    } catch (error) {
      console.error('Failed to update settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
