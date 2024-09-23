"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = require("mongoose");
var WalletSchema = new mongoose_1.default.Schema({
    publicKey: String,
    encryptedSecretData: String,
    secretType: { type: String, enum: ['seed', 'privateKey'] },
    connectedChannels: [String],
});
var UserSchema = new mongoose_1.default.Schema({
    email: { type: String, unique: true },
    discordId: { type: String, required: true, unique: true },
    wallets: [WalletSchema],
    settings: {
        defaultWallet: String,
        maxTradeAmount: { type: Number, default: 100 },
    },
});
exports.default = mongoose_1.default.models.User || mongoose_1.default.model('User', UserSchema);
