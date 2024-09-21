import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    discordId: { type: String, required: true, unique: true },
    wallets: [{
        publicKey: String,
        encryptedPrivateKey: String,
    }],
    settings: {
        defaultWallet: String,
        maxTradeAmount: { type: Number, default: 100 },
        // Add other user-specific settings as needed
    },
    connectedWallets: [{
        channelId: String,
        walletAddress: String,
    }],
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
