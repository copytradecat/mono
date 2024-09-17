import mongoose from 'mongoose';

const TradeSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  walletAddress: { type: String, required: true },
  amount: { type: Number, required: true },
  token: { type: String, required: true },
  txid: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.models.Trade || mongoose.model('Trade', TradeSchema);