import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema({
    publicKey: String,
    encryptedSecretData: String,
    secretType: { type: String, enum: ['seed', 'privateKey'] },
    connectedChannels: [String],
});

const SettingsSchema = new mongoose.Schema({
    slippage: { type: Number, default: 3.0 },
    slippageType: { type: String, enum: ['fixed', 'dynamic'], default: 'fixed' },
    smartMevProtection: { type: String, enum: ['fast', 'secure'], default: 'secure' },
    transactionSpeed: { type: String, enum: ['medium', 'high', 'veryHigh', 'custom', 'auto'], default: 'medium' },
    priorityFee: { type: mongoose.Schema.Types.Mixed, default: 'auto' },
    entryAmounts: { type: [Number], default: [0.05, 0.1, 0.24, 0.69, 0.8, 1] },
    exitPercentages: { type: [Number], default: [24, 33, 100] },
    wrapUnwrapSOL: { type: Boolean, default: true },
});

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true },
    discordId: { type: String, unique: true, sparse: true },
    wallets: [WalletSchema],
    settings: { type: SettingsSchema, default: () => ({}) },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
