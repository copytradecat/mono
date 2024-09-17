import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    encryptedSeed: String,
    discordId: String,
  });
  
export default mongoose.models.User || mongoose.model('User', UserSchema);
