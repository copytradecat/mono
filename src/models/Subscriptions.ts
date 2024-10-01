import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  level: { type: Number, enum: [0, 1, 2, 3], default: 0 },
  lastRenewal: { type: Date, default: Date.now },
}, { strict: 'throw' });

export default mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema);
