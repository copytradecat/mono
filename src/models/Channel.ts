import mongoose from 'mongoose';

const ChannelSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
});

export default mongoose.models.Channel || mongoose.model('Channel', ChannelSchema);
