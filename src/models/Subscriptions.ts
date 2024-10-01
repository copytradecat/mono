import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  subscriptions: [{
    level: { type: Number, required: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' }
  }]
}, { timestamps: true });

export default mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema);
