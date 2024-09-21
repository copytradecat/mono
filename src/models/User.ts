import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema({
    publicKey: String,
    encryptedPrivateKey: String,
    connectedChannels: [String],
});

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    discordId: { type: String, required: true, unique: true },
    wallets: [WalletSchema],
    settings: {
        defaultWallet: String,
        maxTradeAmount: { type: Number, default: 100 },
    },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
