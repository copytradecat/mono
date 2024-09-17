import mongoose from 'mongoose';

const ChannelSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  settings: {
    maxTradeAmount: { type: Number, default: 100 },
    // Add other channel-specific settings as needed
  },
});

export default mongoose.models.Channel || mongoose.model('Channel', ChannelSchema);
