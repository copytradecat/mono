import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema({
    publicKey: String,
    encryptedSecretData: String,
    secretType: { type: String, enum: ['seed', 'privateKey'] },
    connectedChannels: [String],
});

const SettingsSchema = new mongoose.Schema({
    slippage: { type: Number, default: 3.0 },
    smartMevProtection: { type: String, enum: ['fast', 'secure'], default: 'secure' },
    setSpeed: { type: String, enum: ['default', 'auto'], default: 'default' },
    priorityFee: { type: Number, default: 0.01 },
    briberyAmount: { type: Number, default: 0.01 },
    entryAmounts: { type: [Number], default: [0.05, 0.1, 0.24, 0.69, 0.8, 1] },
    exitPercentages: { type: [Number], default: [24, 33, 100] },
    wrapUnwrapSOL: { type: Boolean, default: true },
    useSharedAccounts: { type: Boolean, default: true },
    useTokenLedger: { type: Boolean, default: true },
});

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true },
    discordId: { type: String, unique: true, sparse: true },
    wallets: [WalletSchema],
    settings: { type: SettingsSchema, default: () => ({}) },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
