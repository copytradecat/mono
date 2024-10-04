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

  const { id } = req.query;

  if (req.method === 'PUT') {
    try {
      const { name, settings } = req.body;
      const user = await User.findOneAndUpdate(
        { discordId: session.user?.name, 'presets._id': id },
        { $set: { 'presets.$.name': name, 'presets.$.settings': settings } },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ error: 'User or preset not found' });
      }
      const updatedPreset = user.presets.find((preset: any) => preset._id.toString() === id);
      return res.status(200).json(updatedPreset);
    } catch (error) {
      console.error('Error updating preset:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const user = await User.findOneAndUpdate(
        { discordId: session.user?.name },
        { $pull: { presets: { _id: id } } },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ error: 'User or preset not found' });
      }
      return res.status(200).json({ message: 'Preset deleted successfully' });
    } catch (error) {
      console.error('Error deleting preset:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}