"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
var crypto_1 = require("crypto");
var dotenv_1 = require("dotenv");
dotenv_1.default.config({ path: ['.env.local', '.env'] });
var ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
var IV_LENGTH = 16; // For AES, this is always 16
function getEncryptionKey() {
    if (!ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_SECRET is not set in environment variables');
    }
    // Ensure the key is exactly 32 bytes
    return Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf-8');
}
function encrypt(text) {
    var key = getEncryptionKey();
    var iv = crypto_1.default.randomBytes(IV_LENGTH);
    var cipher = crypto_1.default.createCipheriv('aes-256-cbc', key, iv);
    var encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(text) {
    var key = getEncryptionKey();
    var textParts = text.split(':');
    var iv = Buffer.from(textParts.shift(), 'hex');
    var encryptedText = Buffer.from(textParts.join(':'), 'hex');
    var decipher = crypto_1.default.createDecipheriv('aes-256-cbc', key, iv);
    var decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
