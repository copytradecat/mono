/* eslint-disable no-use-before-define */

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';

// Declare a new interface for the global scope
declare global {
  const mongoose: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  } | undefined;
}
// Initialize the global mongoose object if it doesn't exist
if (!(global as any).mongoose) {
  (global as any).mongoose = { conn: null, promise: null };
}

dotenv.config();
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable in .env.local');
}

let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(MONGODB_URI as string);
  const db = await client.db();

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function connectDB() {
  if ((global as any).mongoose?.conn) {
    return (global as any).mongoose.conn;
  }

  if (!(global as any).mongoose?.promise) {
    const opts = {
      bufferCommands: false,
    };
    (global as any).mongoose = (global as any).mongoose || { conn: null, promise: null };
    (global as any).mongoose.promise = mongoose.connect(MONGODB_URI as string, opts) as unknown;
  }
  (global as any).mongoose.conn = await (global as any).mongoose.promise;
  return (global as any).mongoose.conn;
}

export function disconnectDB() {
  return mongoose.disconnect();
}

export default connectToDatabase;
