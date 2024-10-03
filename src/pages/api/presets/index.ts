import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/authOptions";
import User from '../../../models/User';
import { connectDB } from '../../../lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await connectDB();

  if (req.method === 'GET') {
    try {
      const user = await User.findOne({ discordId: session.user?.name });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(200).json(user.presets);
    } catch (error) {
      console.error('Error fetching presets:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'POST') {
    try {
      const { name, settings } = req.body;
      const user = await User.findOneAndUpdate(
        { discordId: session.user?.name },
        { $push: { presets: { name, settings } } },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(201).json(user.presets[user.presets.length - 1]);
    } catch (error) {
      console.error('Error creating preset:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}