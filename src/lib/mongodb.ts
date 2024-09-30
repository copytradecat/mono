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
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_CREDENTIALS = process.env.MONGODB_CREDENTIALS;

if (!MONGODB_URI && !MONGODB_URL) {
  throw new Error('Please define either MONGODB_URI or MONGODB_URL environment variable');
}

let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  let client: MongoClient;

  // First, try to connect with the certificate if MONGODB_URL and MONGODB_CREDENTIALS are provided
  if (MONGODB_URL && MONGODB_CREDENTIALS) {
    try {
      const options: MongoClientOptions = {
        serverApi: ServerApiVersion.v1,
      };

      if (fs.existsSync(MONGODB_CREDENTIALS)) {
        options.tlsCertificateKeyFile = MONGODB_CREDENTIALS;
      } else {
        options.tlsCertificateKeyFile = Buffer.from(MONGODB_CREDENTIALS, 'base64');
      }

      client = await MongoClient.connect(MONGODB_URL, options);
      console.log('Connected to MongoDB using certificate authentication');
    } catch (error) {
      console.error('Failed to connect with certificate, falling back to URI connection:', error);
      // If certificate connection fails, fall back to URI connection
      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined for fallback connection');
      }
      client = await MongoClient.connect(MONGODB_URI);
      console.log('Connected to MongoDB using URI');
    }
  } else {
    // If MONGODB_URL or MONGODB_CREDENTIALS are not provided, use MONGODB_URI
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined');
    }
    client = await MongoClient.connect(MONGODB_URI);
    console.log('Connected to MongoDB using URI');
  }

  const db = client.db();

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
