import mongoose from 'mongoose';

const FollowSchema = new mongoose.Schema({
  followerId: { type: String, required: true },
  traderId: { type: String, required: true },
  traderAddress: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.models.Follow || mongoose.model('Follow', FollowSchema);
