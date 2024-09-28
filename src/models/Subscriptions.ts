import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  level: { type: String, enum: ['beta', 'free', 'premium'], default: 'free' },
  lastRenewal: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'pending', 'inactive'], default: 'inactive' },
});

export default mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema);
