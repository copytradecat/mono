import CryptoJS from "crypto-js";

const SECRET_KEY = process.env.ENCRYPTION_SECRET || 'fallback_secret_key';

export function encrypt(text: string): string {
  if (!text) throw new Error("Text to encrypt is undefined or empty");
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) throw new Error("Ciphertext to decrypt is undefined or empty");
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
