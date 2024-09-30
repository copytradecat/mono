/* eslint-disable no-use-before-define */

import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, MongoClientOptions } from 'mongodb';
import mongoose from 'mongoose';
import fs from 'fs';

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
const MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_CREDENTIALS = process.env.MONGODB_CREDENTIALS;
if (!MONGODB_URL) {
  throw new Error('Please define the MONGODB_URL environment variable in .env.local');
}

let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const options: MongoClientOptions = {
    serverApi: ServerApiVersion.v1,
    ssl: true,
  };

  if (MONGODB_CREDENTIALS) {
    options.ca = Buffer.from(MONGODB_CREDENTIALS, 'base64');
  }

  const client = await MongoClient.connect(MONGODB_URL as string, options);
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
    (global as any).mongoose.promise = mongoose.connect(MONGODB_URL as string, opts) as unknown;
  }
  (global as any).mongoose.conn = await (global as any).mongoose.promise;
  return (global as any).mongoose.conn;
}

export function disconnectDB() {
  return mongoose.disconnect();
}

export default connectToDatabase;
