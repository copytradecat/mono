import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema({
    publicKey: String,
    encryptedSecretData: String,
    secretType: { type: String, enum: ['seed', 'privateKey'] },
    connectedChannels: [String],
});

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true },
    discordId: { type: String, unique: true, sparse: true },
    wallets: [WalletSchema],
    settings: {
        defaultWallet: String,
        maxTradeAmount: { type: Number, default: 100 },
    },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
