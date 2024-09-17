import mongoose from 'mongoose';

const TradeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  txid: String,
  amount: Number,
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.models.Trade || mongoose.model('Trade', TradeSchema);