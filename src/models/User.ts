import mongoose from 'mongoose';
import { defaultSettings } from '../components/BotSettings';

const SettingsSchema = new mongoose.Schema({
    slippage: { type: Number, default: defaultSettings.slippage },
    slippageType: { type: String, enum: ['fixed', 'dynamic'], default: defaultSettings.slippageType },
    smartMevProtection: {
        type: String,
        enum: ['fast', 'secure'],
        default: defaultSettings.smartMevProtection,
    },
    transactionSpeed: {
        type: String,
        enum: ['medium', 'high', 'veryHigh', 'custom', 'auto'],
        default: defaultSettings.transactionSpeed,
    },
    priorityFee: { type: mongoose.Schema.Types.Mixed, default: defaultSettings.priorityFee },
    entryAmounts: { type: [Number], default: defaultSettings.entryAmounts },
    exitPercentages: { type: [Number], default: defaultSettings.exitPercentages },
    wrapUnwrapSOL: { type: Boolean, default: defaultSettings.wrapUnwrapSOL },
});

const PresetSchema = new mongoose.Schema({
    name: { type: String, required: true },
    settings: { type: SettingsSchema, default: () => ({}) },
});

const WalletSchema = new mongoose.Schema({
    publicKey: String,
    encryptedSecretData: String,
    secretType: { type: String, enum: ['seed', 'privateKey'] },
    connectedChannels: [String],
    settings: { type: SettingsSchema, default: () => ({}) },
    presetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Preset', default: null },
});

const UserSchema = new mongoose.Schema(
    {
        email: { type: String, unique: true, sparse: true },
        username: { type: String, unique: true, sparse: true },
        discordId: { type: String, unique: true, required: true },
        name: { type: String },
        wallets: [WalletSchema],
        settings: { type: SettingsSchema, default: () => ({}) },
        accountNumber: { type: Number, unique: true },
        referrals: [{ type: String }],
        presets: [PresetSchema],
    },
    { timestamps: true }
);

export default mongoose.models.User || mongoose.model('User', UserSchema);