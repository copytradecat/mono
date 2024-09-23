"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var web3_js_1 = require("@solana/web3.js");
var encryption_1 = require("../src/lib/encryption");
var User_1 = require("../src/models/User");
var mongodb_1 = require("../src/lib/mongodb");
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
var app = (0, express_1.default)();
app.use(express_1.default.json());
var connection = new web3_js_1.Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
app.post('/sign-and-send', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, userId, walletPublicKey, serializedTransaction, user, wallet, decryptedSecretData, keypair, transaction, signature, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, userId = _a.userId, walletPublicKey = _a.walletPublicKey, serializedTransaction = _a.serializedTransaction;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 6, , 7]);
                return [4 /*yield*/, (0, mongodb_1.connectDB)()];
            case 2:
                _b.sent();
                return [4 /*yield*/, User_1.default.findOne({ _id: userId })];
            case 3:
                user = _b.sent();
                if (!user) {
                    return [2 /*return*/, res.status(404).json({ error: 'User not found' })];
                }
                wallet = user.wallets.find(function (w) { return w.publicKey === walletPublicKey; });
                if (!wallet) {
                    return [2 /*return*/, res.status(404).json({ error: 'Wallet not found' })];
                }
                decryptedSecretData = (0, encryption_1.decrypt)(wallet.encryptedSecretData);
                keypair = web3_js_1.Keypair.fromSecretKey(Buffer.from(decryptedSecretData, 'base64'));
                transaction = web3_js_1.Transaction.from(Buffer.from(serializedTransaction, 'base64'));
                transaction.partialSign(keypair);
                return [4 /*yield*/, connection.sendRawTransaction(transaction.serialize())];
            case 4:
                signature = _b.sent();
                return [4 /*yield*/, connection.confirmTransaction(signature)];
            case 5:
                _b.sent();
                res.status(200).json({ signature: signature });
                return [3 /*break*/, 7];
            case 6:
                error_1 = _b.sent();
                console.error('Error signing and sending transaction:', error_1);
                res.status(500).json({ error: 'Failed to sign and send transaction' });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
var PORT = process.env.SIGNING_SERVICE_PORT || 3001;
app.listen(PORT, function () {
    console.log("Signing service running on port ".concat(PORT));
});
