import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  level: { type: Number, enum: [0, 1, 2, 3], default: 0 },
  lastRenewal: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'pending', 'inactive'], default: 'inactive' },
  betaRequested: { type: Boolean, default: false },
  referralCode: { type: String, unique: true, sparse: true },
});

export default mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema);
