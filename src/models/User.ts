import mongoose from 'mongoose';
import { defaultSettings } from '../components/BotSettings';

const WalletSchema = new mongoose.Schema({
    publicKey: String,
    encryptedSecretData: String,
    secretType: { type: String, enum: ['seed', 'privateKey'] },
    connectedChannels: [String],
});

const SettingsSchema = new mongoose.Schema({
    slippage: { type: Number, default: defaultSettings.slippage },
    slippageType: { type: String, enum: ['fixed', 'dynamic'], default: defaultSettings.slippageType },
    smartMevProtection: { type: String, enum: ['fast', 'secure'], default: defaultSettings.smartMevProtection },
    transactionSpeed: { type: String, enum: ['medium', 'high', 'veryHigh', 'custom', 'auto'], default: defaultSettings.transactionSpeed },
    priorityFee: { type: mongoose.Schema.Types.Mixed, default: defaultSettings.priorityFee },
    entryAmounts: { type: [Number], default: defaultSettings.entryAmounts },
    exitPercentages: { type: [Number], default: defaultSettings.exitPercentages },
    wrapUnwrapSOL: { type: Boolean, default: defaultSettings.wrapUnwrapSOL },
});

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true },
    discordId: { type: String, unique: true, sparse: true },
    name: { type: String },
    wallets: [WalletSchema],
    settings: { type: SettingsSchema, default: () => ({}) },
    accountNumber: { type: Number, unique: true },
    referrer: { type: String },
    referralCode: { type: String, unique: true },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
