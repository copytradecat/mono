import mongoose, { Model, Document } from 'mongoose';
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
});

// Define the interface for the User document
interface IUser extends Document {
    email?: string;
    username?: string;
    discordId: string;
    name?: string;
    referrals: string[];
    accountNumber: number;
    wallets: any[]; // You might want to define a more specific type for wallets
    presets: any[]; // You might want to define a more specific type for presets
    primaryPresetId?: mongoose.Types.ObjectId;
}

// Define the User model
const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true },
    username: { type: String, unique: true, sparse: true },
    discordId: { type: String, unique: true, required: true },
    name: { type: String },
    referrals: [{ type: String }],
    accountNumber: { type: Number, unique: true },
    wallets: [WalletSchema],
    presets: [PresetSchema],
    primaryPresetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Preset' },
}, { timestamps: true });

// Create the model
let UserModel: Model<IUser>;

try {
    // Try to retrieve the existing model
    UserModel = mongoose.model<IUser>('User');
} catch (error) {
    // If the model doesn't exist, create it
    UserModel = mongoose.model<IUser>('User', UserSchema);
}

export default UserModel;